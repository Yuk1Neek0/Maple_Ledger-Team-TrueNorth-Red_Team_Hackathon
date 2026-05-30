import { useMemo, useState } from "react";
import { canonicalize } from "./lib/canonical.js";
import { validatePayload } from "./lib/validate.js";
import {
  contentHash,
  generateKeypair,
  keypairFromPrivateHex,
  keypairFromPrivateB64,
  signPayload,
  verifyPayload,
} from "./lib/crypto.js";
import { submitAttestation, BACKEND_URL } from "./lib/api.js";
import { runCanonicalSelfTest } from "./lib/canonical.test.js";
import { DEMO_IDENTITIES } from "./devIdentities.js";
import Panel from "./components/ui/Panel.jsx";
import Shell from "./components/ui/Shell.jsx";
import AttestationShare from "./components/AttestationShare.jsx";

// Steps of the supplier flow.
const STEP_FORM = "form";
const STEP_CONFIRM = "confirm";
const STEP_DONE = "done";

const ACTION_TYPES = [
  "raw_material_supply",
  "component_manufacture",
  "subassembly",
  "final_integration",
];

// Step-type pill copy — a short label for each schema action_type.
const STEP_TYPE_LABEL = {
  raw_material_supply: "SOURCE",
  component_manufacture: "TRANSFORM",
  subassembly: "ASSEMBLE",
  final_integration: "INTEGRATE",
};

// Labour hours at or above this imply a substantial transformation (advisory).
const SUBSTANTIAL_TRANSFORM_HOURS = 4;

// Shared control-surface styles (Maple Ledger light).
const BTN_CYAN =
  "inline-flex items-center justify-center gap-2 rounded-btn bg-navy px-5 py-2 text-sm font-medium text-paper transition hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-40";
const BTN_SIGNAL =
  "inline-flex items-center justify-center gap-2 rounded-btn bg-navy px-6 py-2 text-sm font-semibold text-paper transition hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-50";
const BTN_GHOST =
  "inline-flex items-center justify-center gap-2 rounded-btn border border-line-2 bg-paper px-5 py-2 text-sm font-medium text-ink transition hover:bg-paper-2 disabled:opacity-40";

const inputClass =
  "mt-1 w-full rounded-btn border border-line-2 bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy/30";

// A random att- UUID v4 for a fresh attestation id.
function newAttestationId() {
  const uuid =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
  return `att-${uuid}`;
}

function emptyParent() {
  return { attestation_id: "", content_hash: "", quantity_consumed: "1", unit: "units" };
}

// Default form values matching the worked-example parachute component.
function defaultForm() {
  return {
    attestation_id: newAttestationId(),
    version: "1.0",
    supplier_id: "sup-avss-corp",
    timestamp: "2026-03-21T14:30:00Z",
    action_type: "component_manufacture",
    performed_in_country: "CA",
    parents: [
      {
        attestation_id: "att-anchor-0001",
        content_hash: "1ed6d6cc7b1526c7473ad8532a6f8ae5e17470bc09434f5da51e9d33c2cddaa4",
        quantity_consumed: "8",
        unit: "m2",
      },
    ],
    output_name: "Parachute Recovery Assembly",
    output_quantity: "1",
    output_unit: "units",
    material_cad: "0",
    labour_hours: "6.5",
    labour_cost_cad: "520",
  };
}

// Build the signed-attestation object from raw form strings. Numbers are coerced
// to JS numbers; anything that isn't a finite number is left as the raw value so
// validation reports it.
function buildPayload(form) {
  const toNum = (v) => {
    const t = String(v).trim();
    if (t === "") return v; // keep raw -> validation fails
    const n = Number(t);
    return Number.isFinite(n) ? n : v;
  };

  return {
    attestation_id: form.attestation_id.trim(),
    version: form.version.trim(),
    supplier_id: form.supplier_id.trim(),
    timestamp: form.timestamp.trim(),
    action_type: form.action_type,
    performed_in_country: form.performed_in_country.trim().toUpperCase(),
    parents: form.parents.map((p) => ({
      attestation_id: p.attestation_id.trim(),
      content_hash: p.content_hash.trim().toLowerCase(),
      quantity_consumed: toNum(p.quantity_consumed),
      unit: p.unit.trim(),
    })),
    output: {
      name: form.output_name.trim(),
      quantity_produced: toNum(form.output_quantity),
      unit: form.output_unit.trim(),
    },
    costs: {
      material_cad: toNum(form.material_cad),
      labour_hours: toNum(form.labour_hours),
      labour_cost_cad: toNum(form.labour_cost_cad),
    },
  };
}

function Field({ label, hint, children }) {
  return (
    <label className="block text-left">
      <span className="block font-mono text-[11px] font-medium uppercase tracking-wider text-ink-3">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

export default function App() {
  const [step, setStep] = useState(STEP_FORM);
  const [form, setForm] = useState(defaultForm);
  const [keypair, setKeypair] = useState(generateKeypair);
  const [privInput, setPrivInput] = useState("");
  const [keyError, setKeyError] = useState("");
  const [submitState, setSubmitState] = useState({ status: "idle" }); // idle|signing|submitting|done|error
  const [result, setResult] = useState(null);
  useState(() => {
    const r = runCanonicalSelfTest();
    if (r.pass) {
      console.log("[canonical self-test] PASS — byte-parity with reference_lib");
    } else {
      console.error("[canonical self-test] FAIL", r.checks);
    }
    return r;
  });

  const payload = useMemo(() => buildPayload(form), [form]);
  const validation = useMemo(() => validatePayload(payload), [payload]);
  const canonical = useMemo(() => {
    try {
      return canonicalize(payload);
    } catch (e) {
      return "(cannot canonicalize: " + e.message + ")";
    }
  }, [payload]);
  // The content_hash a child would reference as parents[].content_hash.
  const hashPreview = useMemo(() => {
    try {
      return validation.valid ? contentHash(payload) : null;
    } catch {
      return null;
    }
  }, [payload, validation.valid]);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function updateParent(idx, key, value) {
    setForm((f) => {
      const parents = f.parents.slice();
      parents[idx] = { ...parents[idx], [key]: value };
      return { ...f, parents };
    });
  }

  function addParent() {
    setForm((f) => ({ ...f, parents: [...f.parents, emptyParent()] }));
  }

  function removeParent(idx) {
    setForm((f) => ({ ...f, parents: f.parents.filter((_, i) => i !== idx) }));
  }

  function applyPastedKey() {
    setKeyError("");
    const v = privInput.trim();
    try {
      // Accept either 64-hex-char or base64 (the kit ships base64 seeds).
      if (/^[0-9a-fA-F]{64}$/.test(v)) {
        setKeypair(keypairFromPrivateHex(v));
      } else {
        setKeypair(keypairFromPrivateB64(v));
      }
    } catch (e) {
      setKeyError(e.message);
    }
  }

  function regenerateKey() {
    setKeyError("");
    setPrivInput("");
    setKeypair(generateKeypair());
  }

  function goConfirm() {
    if (validation.valid) setStep(STEP_CONFIRM);
  }

  async function signAndSubmit() {
    if (!keypair) return;
    setSubmitState({ status: "signing" });
    try {
      const { signature, canonical: canonicalStr } = signPayload(payload, keypair.privateKey);
      const verified = verifyPayload(signature, payload, keypair.publicKey);
      const signedBody = {
        ...payload,
        signature: { algorithm: "ed25519", value: signature },
      };
      const hash = contentHash(payload);

      setSubmitState({ status: "submitting" });

      let backendResult = null;
      let backendError = null;
      try {
        backendResult = await submitAttestation(signedBody);
      } catch (e) {
        backendError = e.message;
      }

      setResult({
        hash,
        signature,
        signedBody,
        canonical: canonicalStr,
        verified,
        backendResult,
        backendError,
      });
      setSubmitState({ status: backendError ? "error" : "done" });
      setStep(STEP_DONE);
    } catch (e) {
      setSubmitState({ status: "error" });
      setResult({ fatal: e.message });
      setStep(STEP_DONE);
    }
  }

  function loadDemoIdentity(sid) {
    const seed = DEMO_IDENTITIES[sid];
    if (!seed) return;
    setKeyError("");
    try {
      setKeypair(keypairFromPrivateB64(seed));
      setPrivInput(seed);
      update("supplier_id", sid);
    } catch (e) {
      setKeyError(e.message);
    }
  }

  function resetAll() {
    setForm(defaultForm());
    setResult(null);
    setSubmitState({ status: "idle" });
    setStep(STEP_FORM);
  }

  const STEP_LABEL = { form: "1 · author", confirm: "2 · confirm", done: "3 · issued" };

  return (
    <Shell
      active="supplier"
      context="supplier · attestation signer"
      backend={BACKEND_URL.replace(/^https?:\/\//, "")}
    >
      <div className="mx-auto w-full max-w-3xl px-6 pt-6">
        <div className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-wider text-ink-3">
          {Object.entries(STEP_LABEL).map(([k, v]) => (
            <span key={k} className={step === k ? "text-navy" : ""}>
              {step === k ? "▸ " : ""}
              {v}
            </span>
          ))}
        </div>
      </div>

      <main className="mx-auto w-full max-w-3xl px-6 py-8">
        {step === STEP_FORM && (
          <div className="space-y-6">
            <SigningAs supplierId={form.supplier_id} keypair={keypair} />
            <IdentityLoader onLoadIdentity={loadDemoIdentity} />
            <FormStep
              form={form}
              payload={payload}
              validation={validation}
              canonical={canonical}
              hashPreview={hashPreview}
              keypair={keypair}
              privInput={privInput}
              setPrivInput={setPrivInput}
              keyError={keyError}
              applyPastedKey={applyPastedKey}
              regenerateKey={regenerateKey}
              update={update}
              updateParent={updateParent}
              addParent={addParent}
              removeParent={removeParent}
              onContinue={goConfirm}
            />
          </div>
        )}

        {step === STEP_CONFIRM && (
          <ConfirmStep
            payload={payload}
            canonical={canonical}
            hashPreview={hashPreview}
            keypair={keypair}
            submitState={submitState}
            onBack={() => setStep(STEP_FORM)}
            onConfirm={signAndSubmit}
          />
        )}

        {step === STEP_DONE && <DoneStep result={result} onReset={resetAll} />}
      </main>
    </Shell>
  );
}

// Signing-as banner: the issuing identity and the public key the verifier will
// check the signature against. The supplier_id maps to a registry key; the
// signature only verifies if that key is the trusted one on file.
function SigningAs({ supplierId, keypair }) {
  const fp = keypair?.publicB64 ? keypair.publicB64.slice(0, 22) + "…" : "—";
  return (
    <section className="rounded-card border border-line-2 bg-paper p-4">
      <div className="font-mono text-[11px] uppercase tracking-wider text-ink-3">
        Signing as
      </div>
      <div className="mt-0.5 text-lg font-semibold text-navy">{supplierId || "—"}</div>
      <div className="mt-3 border-t border-line pt-2.5 font-mono text-[11px] text-ink-2">
        <span className="uppercase tracking-wider text-ink-3">public key</span>{" "}
        <span className="text-navy">{fp}</span>
      </div>
    </section>
  );
}

// IdentityLoader: pick a kit supplier whose private key the registry trusts, so
// the signed attestation actually verifies against POST /verify.
function IdentityLoader({ onLoadIdentity }) {
  const ids = Object.keys(DEMO_IDENTITIES);
  return (
    <Panel label="identity" accent="navy">
      <label className="block text-left">
        <span className="block font-mono text-[11px] font-medium uppercase tracking-wider text-ink-3">
          Load demo identity
        </span>
        <select className={inputClass} defaultValue="" onChange={(e) => e.target.value && onLoadIdentity(e.target.value)}>
          <option value="" disabled>
            choose a registered supplier…
          </option>
          {ids.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-ink-3">
          Loads a kit private key the registry trusts, so the attestation&apos;s signature verifies.
        </span>
      </label>
    </Panel>
  );
}

// Step-type pill group — selects form.action_type with a TRANSFORM-style pill.
function StepTypePills({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ACTION_TYPES.map((a) => {
        const selected = a === value;
        return (
          <button
            key={a}
            type="button"
            onClick={() => onChange(a)}
            title={a}
            className={
              "rounded-chip px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-wider transition " +
              (selected
                ? "bg-navy text-paper"
                : "border border-line-2 bg-paper text-ink-2 hover:bg-paper-2")
            }
          >
            {STEP_TYPE_LABEL[a] || a}
          </button>
        );
      })}
    </div>
  );
}

function FormStep(props) {
  const {
    form,
    validation,
    canonical,
    hashPreview,
    keypair,
    privInput,
    setPrivInput,
    keyError,
    applyPastedKey,
    regenerateKey,
    update,
    updateParent,
    addParent,
    removeParent,
    onContinue,
  } = props;
  const payload = props.payload;

  const isSubstantial = Number(form.labour_hours) >= SUBSTANTIAL_TRANSFORM_HOURS;

  return (
    <div className="space-y-6">
      <Panel label="attestation" accent="navy">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Attestation ID" hint="att- + UUID, globally unique">
            <input className={inputClass + " font-mono"} value={form.attestation_id} onChange={(e) => update("attestation_id", e.target.value)} placeholder="att-…" />
          </Field>
          <Field label="Version" hint='e.g. "1.0"'>
            <input className={inputClass} value={form.version} onChange={(e) => update("version", e.target.value)} placeholder="1.0" />
          </Field>
          <Field label="Supplier ID" hint="must match a registry key">
            <input className={inputClass} value={form.supplier_id} onChange={(e) => update("supplier_id", e.target.value)} placeholder="sup-avss-corp" />
          </Field>
          <Field label="Performed in country" hint="ISO-2 uppercase, e.g. CA">
            <input className={inputClass} value={form.performed_in_country} onChange={(e) => update("performed_in_country", e.target.value)} placeholder="CA" maxLength={2} />
          </Field>
          <Field label="Timestamp" hint="ISO-8601 UTC, ends in Z">
            <input className={inputClass} value={form.timestamp} onChange={(e) => update("timestamp", e.target.value)} placeholder="2026-03-21T14:30:00Z" />
          </Field>
        </div>

        <h3 className="mt-6 mb-2 font-mono text-[11px] font-medium uppercase tracking-wider text-ink-3">Step type</h3>
        <StepTypePills value={form.action_type} onChange={(v) => update("action_type", v)} />

        <div className="mt-4 flex items-center justify-between rounded-btn border border-line-2 bg-paper-2 px-3 py-2.5">
          <div>
            <div className="text-sm font-medium text-ink">Last substantial transformation</div>
            <div className="text-xs text-ink-3">
              Derived from labour ≥ {SUBSTANTIAL_TRANSFORM_HOURS}h · advisory, does not alter the signed payload
            </div>
          </div>
          <span
            className={
              "inline-flex items-center gap-1.5 rounded-chip px-2.5 py-1 text-xs font-medium " +
              (isSubstantial ? "bg-tint-ok text-ok" : "bg-tint-navy text-ink-2")
            }
          >
            <span
              className={"inline-block h-1.5 w-1.5 rounded-full " + (isSubstantial ? "bg-ok" : "bg-ink-3")}
              aria-hidden
            />
            {isSubstantial ? "yes" : "no"}
          </span>
        </div>

        <h3 className="mt-6 mb-2 font-mono text-[11px] font-medium uppercase tracking-wider text-ink-3">Output</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Name">
            <input className={inputClass} value={form.output_name} onChange={(e) => update("output_name", e.target.value)} placeholder="Parachute Recovery Assembly" />
          </Field>
          <Field label="Quantity produced" hint="number">
            <input className={inputClass} value={form.output_quantity} onChange={(e) => update("output_quantity", e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Unit">
            <input className={inputClass} value={form.output_unit} onChange={(e) => update("output_unit", e.target.value)} placeholder="units" />
          </Field>
        </div>

        <h3 className="mt-6 mb-2 font-mono text-[11px] font-medium uppercase tracking-wider text-ink-3">Materials &amp; labour (CAD)</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Material (CAD)" hint="e.g. 360 or 1.2">
            <input className={inputClass} value={form.material_cad} onChange={(e) => update("material_cad", e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Labour hours" hint={`≥ ${SUBSTANTIAL_TRANSFORM_HOURS} ⇒ substantial transformation`}>
            <input className={inputClass} value={form.labour_hours} onChange={(e) => update("labour_hours", e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Labour cost (CAD)" hint="e.g. 520">
            <input className={inputClass} value={form.labour_cost_cad} onChange={(e) => update("labour_cost_cad", e.target.value)} inputMode="decimal" />
          </Field>
        </div>
      </Panel>

      <Panel
        label="inputs consumed"
        accent="navy"
        right={
          <button type="button" onClick={addParent} className="font-mono uppercase tracking-wider text-navy transition hover:text-ink">
            + add parent
          </button>
        }
      >
        {form.parents.length === 0 && (
          <p className="text-sm text-ink-3">No parents (a raw_material_supply attestation has none).</p>
        )}
        <div className="space-y-4">
          {form.parents.map((p, idx) => (
            <div key={idx} className="rounded-btn border border-line-2 bg-paper-2 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-wider text-ink-3">Parent #{idx + 1}</span>
                <button
                  type="button"
                  onClick={() => removeParent(idx)}
                  className="rounded-btn border border-line-2 bg-paper px-2.5 py-1 text-xs font-medium text-ink-2 transition hover:border-red hover:text-red"
                >
                  remove
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Attestation ID">
                  <input className={inputClass + " font-mono"} value={p.attestation_id} onChange={(e) => updateParent(idx, "attestation_id", e.target.value)} placeholder="att-…" />
                </Field>
                <Field label="Content hash" hint="64-char lowercase hex SHA-256">
                  <input className={inputClass + " font-mono"} value={p.content_hash} onChange={(e) => updateParent(idx, "content_hash", e.target.value)} placeholder="1ed6d6cc…" />
                </Field>
                <Field label="Quantity consumed" hint="number">
                  <input className={inputClass} value={p.quantity_consumed} onChange={(e) => updateParent(idx, "quantity_consumed", e.target.value)} inputMode="decimal" />
                </Field>
                <Field label="Unit" hint="must equal the parent's output.unit">
                  <input className={inputClass} value={p.unit} onChange={(e) => updateParent(idx, "unit", e.target.value)} placeholder="m2" />
                </Field>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel label="signing key" accent="navy">
        <p className="text-sm text-ink-2">
          A fresh Ed25519 keypair is generated in your browser. You may paste a 32-byte private key
          (64 hex chars or base64) instead — the kit ships base64 seeds.
        </p>
        <dl className="mt-3 space-y-1 text-xs">
          <div className="break-all">
            <span className="font-mono font-medium uppercase tracking-wider text-ink-3">public key (base64): </span>
            <code className="font-mono text-navy">{keypair?.publicB64}</code>
          </div>
        </dl>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            className={inputClass + " font-mono"}
            value={privInput}
            onChange={(e) => setPrivInput(e.target.value)}
            placeholder="paste private key — 64 hex chars or base64 (optional)"
          />
          <button type="button" onClick={applyPastedKey} disabled={!privInput.trim()} className={BTN_CYAN}>
            use key
          </button>
          <button type="button" onClick={regenerateKey} className={BTN_GHOST}>
            regenerate
          </button>
        </div>
        {keyError && <p className="mt-2 text-sm text-red">{keyError}</p>}
      </Panel>

      <Panel label="attestation preview" accent="navy" right="what gets signed">
        <p className="mb-1 font-mono text-[11px] uppercase tracking-wider text-ink-3">Assembled payload (signature excluded)</p>
        <pre className="mb-4 overflow-x-auto rounded-btn border border-line-2 bg-paper-2 p-3 font-mono text-xs text-ink">
{JSON.stringify(payload, null, 2)}
        </pre>
        <p className="mb-1 font-mono text-[11px] uppercase tracking-wider text-ink-3">
          Canonical bytes — one changed byte breaks the signature
        </p>
        <pre className="overflow-x-auto rounded-btn border border-line-2 bg-paper-2 p-3 font-mono text-xs text-navy">
{canonical}
        </pre>
        {hashPreview && (
          <div className="mt-3 break-all text-xs">
            <span className="font-mono font-medium uppercase tracking-wider text-ink-3">content_hash (children reference this): </span>
            <code className="font-mono text-navy">{hashPreview}</code>
          </div>
        )}
      </Panel>

      {!validation.valid && (
        <Panel label="blocked" accent="red" right="fix to continue">
          <ul className="list-disc space-y-1 pl-5 text-sm text-red">
            {validation.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="flex justify-end">
        <button type="button" onClick={onContinue} disabled={!validation.valid} className={BTN_CYAN}>
          review &amp; sign ▸
        </button>
      </div>
    </div>
  );
}

function ConfirmStep({ payload, canonical, hashPreview, keypair, submitState, onBack, onConfirm }) {
  const busy = submitState.status === "signing" || submitState.status === "submitting";
  return (
    <div className="space-y-6">
      <Panel label="confirm before signing" accent="navy" right="irreversible">
        <p className="text-sm text-ink-2">
          Review the exact payload below. Once signed, any change to a single byte invalidates the
          signature. This is what will be signed and submitted.
        </p>
      </Panel>

      <Panel label="payload" accent="navy">
        <p className="mb-1 font-mono text-[11px] uppercase tracking-wider text-ink-3">Payload (signature excluded)</p>
        <pre className="mb-4 overflow-x-auto rounded-btn border border-line-2 bg-paper-2 p-3 font-mono text-xs text-ink">
{JSON.stringify(payload, null, 2)}
        </pre>
        <p className="mb-1 font-mono text-[11px] uppercase tracking-wider text-ink-3">Canonical bytes</p>
        <pre className="mb-4 overflow-x-auto rounded-btn border border-line-2 bg-paper-2 p-3 font-mono text-xs text-navy">
{canonical}
        </pre>
        {hashPreview && (
          <p className="mb-3 break-all text-xs text-ink-2">
            content_hash <code className="font-mono text-navy">{hashPreview}</code>
          </p>
        )}
        <p className="text-xs text-ink-2">
          Signing with public key <code className="break-all font-mono text-navy">{keypair?.publicB64}</code>
        </p>
      </Panel>

      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} disabled={busy} className={BTN_GHOST}>
          ◂ back to edit
        </button>
        <button type="button" onClick={onConfirm} disabled={busy} className={BTN_SIGNAL}>
          {submitState.status === "signing"
            ? "signing…"
            : submitState.status === "submitting"
            ? "submitting…"
            : "⬢ sign & submit"}
        </button>
      </div>
    </div>
  );
}

function DoneStep({ result, onReset }) {
  if (!result) return null;
  if (result.fatal) {
    return (
      <div className="space-y-4">
        <Panel label="signing failed" accent="red" right="halted">
          <p className="text-sm text-red">{result.fatal}</p>
        </Panel>
        <button type="button" onClick={onReset} className={BTN_GHOST}>
          ↻ start over
        </button>
      </div>
    );
  }

  const submitted = !result.backendError;
  const verdict = result.backendResult;
  return (
    <div className="space-y-6">
      <Panel
        label={submitted ? "attestation issued" : "signed locally"}
        accent={submitted ? "ok" : "navy"}
        right={submitted ? "verified by backend" : "backend unreachable"}
      >
        {submitted ? (
          <div className="rounded-btn border border-ok/30 bg-tint-ok p-4">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-ok">
              <span className="inline-block h-2 w-2 rounded-full bg-ok" aria-hidden /> ISSUED · signed &amp; submitted to /verify
            </div>
            <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-ink-3">content hash</p>
            <code className="mt-1 block break-all rounded-btn border border-line-2 bg-paper px-3 py-2 font-mono text-sm text-navy">
              {result.hash}
            </code>
            {verdict && (
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt className="text-ink-3">designation</dt>
                <dd className="text-ink">{verdict.designation}</dd>
                <dt className="text-ink-3">canadian content</dt>
                <dd className="text-navy">{verdict.canadian_content_percentage}%</dd>
                <dt className="text-ink-3">chain valid</dt>
                <dd className={verdict.chain_valid ? "text-ok" : "text-red"}>
                  {String(verdict.chain_valid)}
                </dd>
                <dt className="text-ink-3">anomalies</dt>
                <dd className="text-ink">{(verdict.anomalies || []).length}</dd>
              </dl>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-2">
            The attestation was signed and verified locally, but the POST to the backend failed:{" "}
            <span className="font-mono text-red">{result.backendError}</span>. The signed body
            below is valid and ready to submit once the backend is reachable.
          </p>
        )}
      </Panel>

      <AttestationShare signedBody={result.signedBody} />

      <Panel label="signed body" accent="navy" right="signature: { algorithm, value }">
        <p className="text-sm text-ink-2">
          Local signature verification:{" "}
          <span className={result.verified ? "font-semibold text-ok" : "font-semibold text-red"}>
            {result.verified ? "valid" : "INVALID"}
          </span>
        </p>
        <pre className="mt-3 overflow-x-auto rounded-btn border border-line-2 bg-paper-2 p-3 font-mono text-xs text-ink">
{JSON.stringify(result.signedBody, null, 2)}
        </pre>
      </Panel>

      <button type="button" onClick={onReset} className={BTN_GHOST}>
        ↻ author another
      </button>
    </div>
  );
}
