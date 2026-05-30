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
import Panel, { StatusNode } from "./components/ui/Panel.jsx";

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

// Shared control-surface button styles.
const BTN_CYAN =
  "inline-flex items-center justify-center gap-2 border border-cyan bg-cyan/10 px-5 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-cyan transition hover:bg-cyan/20 disabled:cursor-not-allowed disabled:opacity-40";
const BTN_SIGNAL =
  "inline-flex items-center justify-center gap-2 border border-signal/60 bg-signal/10 px-6 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-signal transition hover:bg-signal/20 disabled:cursor-not-allowed disabled:opacity-50";
const BTN_GHOST =
  "inline-flex items-center justify-center gap-2 border border-line px-5 py-2 text-sm font-medium uppercase tracking-[0.14em] text-dim transition hover:border-line-bright hover:text-ink disabled:opacity-40";

const inputClass =
  "mt-1 w-full border border-line bg-base px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-cyan focus:outline-none";

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
      <span className="block text-[11px] font-medium uppercase tracking-[0.12em] text-dim">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
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
  const [selfTest] = useState(() => {
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

  // Apply an AI-drafted attestation to the form. The human still reviews every
  // field and signs — the draft is advisory.
  function applyDraft(draft) {
    setForm((f) => ({
      ...f,
      supplier_id: draft.supplier_id ?? f.supplier_id,
      action_type: ACTION_TYPES.includes(draft.action_type) ? draft.action_type : f.action_type,
      performed_in_country: draft.performed_in_country ?? f.performed_in_country,
      output_name: draft.output?.name ?? f.output_name,
      output_quantity:
        draft.output?.quantity_produced != null
          ? String(draft.output.quantity_produced)
          : f.output_quantity,
      output_unit: draft.output?.unit ?? f.output_unit,
      material_cad: draft.costs?.material_cad != null ? String(draft.costs.material_cad) : f.material_cad,
      labour_hours: draft.costs?.labour_hours != null ? String(draft.costs.labour_hours) : f.labour_hours,
      labour_cost_cad:
        draft.costs?.labour_cost_cad != null ? String(draft.costs.labour_cost_cad) : f.labour_cost_cad,
      timestamp: draft.timestamp ?? f.timestamp,
      parents: Array.isArray(draft.parents)
        ? draft.parents.map((p) => ({
            attestation_id: p.attestation_id ?? "",
            content_hash: p.content_hash ?? "",
            quantity_consumed: String(p.quantity_consumed ?? "1"),
            unit: p.unit ?? "units",
          }))
        : f.parents,
    }));
  }

  function resetAll() {
    setForm(defaultForm());
    setResult(null);
    setSubmitState({ status: "idle" });
    setStep(STEP_FORM);
  }

  const STEP_LABEL = { form: "1 · author", confirm: "2 · confirm", done: "3 · issued" };

  return (
    <div className="flex min-h-full flex-col">
      <div className="h-0.5 w-full bg-gradient-to-r from-maple via-maple/40 to-transparent" />

      <header className="sticky top-0 z-40 border-b border-line bg-panel/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-2.5">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt="" aria-hidden className="h-6 w-6" />
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-[0.22em] text-ink">MAPLE LEDGER</div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-dim">
                issuing console · attestation signer
              </div>
            </div>
          </div>
          <SelfTestBadge selfTest={selfTest} />
        </div>
        <div className="border-t border-line bg-base/60 px-6 py-1.5">
          <div className="mx-auto flex max-w-3xl items-center gap-4 text-[10px] uppercase tracking-[0.18em] text-faint">
            {Object.entries(STEP_LABEL).map(([k, v]) => (
              <span key={k} className={step === k ? "text-cyan" : ""}>
                {step === k ? "▸ " : ""}
                {v}
              </span>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
        {step === STEP_FORM && (
          <div className="space-y-6">
            <AuthoringTools onLoadIdentity={loadDemoIdentity} onApplyDraft={applyDraft} />
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

      <footer className="mx-auto w-full max-w-3xl px-6 pb-10 text-center text-[11px] uppercase tracking-[0.16em] text-faint">
        backend · <code className="text-dim">{BACKEND_URL}/verify</code>
      </footer>
    </div>
  );
}

function SelfTestBadge({ selfTest }) {
  if (!selfTest) return null;
  const ok = selfTest.pass;
  return (
    <span
      title={ok ? "Canonical bytes match reference_lib (content_hash fixtures verified)" : "Canonicalization mismatch — see console"}
      className={"border px-2.5 py-1 " + (ok ? "border-signal/40 bg-signal/10" : "border-alarm/40 bg-alarm/10")}
    >
      <StatusNode tone={ok ? "signal" : "alarm"} label={`canonical ${ok ? "pass" : "fail"}`} blink={ok} />
    </span>
  );
}

function AuthoringTools({ onLoadIdentity, onApplyDraft }) {
  const ids = Object.keys(DEMO_IDENTITIES);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function draft() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`${BACKEND_URL}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.detail || `Draft unavailable (HTTP ${res.status}).`);
        return;
      }
      onApplyDraft(data.draft || {});
      setMsg(data.notes || "Draft applied — review every field before signing.");
    } catch (e) {
      setMsg(`Could not reach backend: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel label="authoring tools" accent="cyan">
      <label className="block text-left">
        <span className="block text-[11px] font-medium uppercase tracking-[0.12em] text-dim">
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
        <span className="mt-1 block text-xs text-faint">
          Loads a kit private key the registry trusts, so the attestation&apos;s signature verifies.
        </span>
      </label>

      <h3 className="mt-5 mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-cyan">
        Draft with AI <span className="font-normal text-faint">(advisory — you review &amp; sign)</span>
      </h3>
      <textarea
        className={inputClass + " prose-sans h-20"}
        placeholder="e.g. We CNC-milled a RAVEN airframe in Ontario, 6.5 labour hours at $80/hr, from Canadian 6061 billet."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-2 flex items-center gap-3">
        <button type="button" onClick={draft} disabled={busy || !text.trim()} className={BTN_CYAN}>
          {busy ? "drafting…" : "▸ draft with ai"}
        </button>
        {msg && <span className="prose-sans text-xs text-dim">{msg}</span>}
      </div>
    </Panel>
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

  return (
    <div className="space-y-6">
      <Panel label="attestation" accent="cyan">
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
          <Field label="Action type">
            <select className={inputClass} value={form.action_type} onChange={(e) => update("action_type", e.target.value)}>
              {ACTION_TYPES.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </Field>
          <Field label="Timestamp" hint="ISO-8601 UTC, ends in Z">
            <input className={inputClass} value={form.timestamp} onChange={(e) => update("timestamp", e.target.value)} placeholder="2026-03-21T14:30:00Z" />
          </Field>
        </div>

        <h3 className="mt-6 mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-dim">Output</h3>
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

        <h3 className="mt-6 mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-dim">Costs (CAD)</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Material (CAD)" hint="e.g. 360 or 1.2">
            <input className={inputClass} value={form.material_cad} onChange={(e) => update("material_cad", e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Labour hours" hint="≥ 4 ⇒ substantial transformation">
            <input className={inputClass} value={form.labour_hours} onChange={(e) => update("labour_hours", e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Labour cost (CAD)" hint="e.g. 520">
            <input className={inputClass} value={form.labour_cost_cad} onChange={(e) => update("labour_cost_cad", e.target.value)} inputMode="decimal" />
          </Field>
        </div>
      </Panel>

      <Panel
        label="parents consumed"
        accent="cyan"
        right={
          <button type="button" onClick={addParent} className="text-cyan transition hover:text-ink">
            + add parent
          </button>
        }
      >
        {form.parents.length === 0 && (
          <p className="prose-sans text-sm text-faint">No parents (a raw_material_supply attestation has none).</p>
        )}
        <div className="space-y-4">
          {form.parents.map((p, idx) => (
            <div key={idx} className="border border-line bg-base/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-[0.12em] text-faint">Parent #{idx + 1}</span>
                <button
                  type="button"
                  onClick={() => removeParent(idx)}
                  className="border border-alarm/40 bg-alarm/10 px-2.5 py-1 text-xs font-medium uppercase tracking-[0.1em] text-alarm transition hover:bg-alarm/20"
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

      <Panel label="signing key" accent="cyan">
        <p className="prose-sans text-sm text-dim">
          A fresh Ed25519 keypair is generated in your browser. You may paste a 32-byte private key
          (64 hex chars or base64) instead — the kit ships base64 seeds.
        </p>
        <dl className="mt-3 space-y-1 text-xs">
          <div className="break-all">
            <span className="font-medium uppercase tracking-[0.1em] text-faint">public key (base64): </span>
            <code className="text-signal/90">{keypair?.publicB64}</code>
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
        {keyError && <p className="mt-2 text-sm text-alarm">{keyError}</p>}
      </Panel>

      <Panel label="live preview" accent="cyan" right="what gets signed">
        <p className="mb-1 text-[11px] uppercase tracking-[0.1em] text-faint">Assembled payload (signature excluded)</p>
        <pre className="mb-4 overflow-x-auto border border-line bg-base p-3 text-xs text-ink">
{JSON.stringify(payload, null, 2)}
        </pre>
        <p className="mb-1 text-[11px] uppercase tracking-[0.1em] text-faint">
          Canonical bytes — one changed byte breaks the signature
        </p>
        <pre className="overflow-x-auto border border-line bg-base p-3 text-xs text-signal/90">
{canonical}
        </pre>
        {hashPreview && (
          <div className="mt-3 break-all text-xs">
            <span className="font-medium uppercase tracking-[0.1em] text-faint">content_hash (children reference this): </span>
            <code className="text-signal/90">{hashPreview}</code>
          </div>
        )}
      </Panel>

      {!validation.valid && (
        <Panel label="blocked" accent="alarm" right="fix to continue">
          <ul className="list-disc space-y-1 pl-5 text-sm text-alarm">
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
      <Panel label="confirm before signing" accent="amber" right="irreversible">
        <p className="prose-sans text-sm text-amber/90">
          Review the exact payload below. Once signed, any change to a single byte invalidates the
          signature. This is what will be signed and submitted.
        </p>
      </Panel>

      <Panel label="payload" accent="cyan">
        <p className="mb-1 text-[11px] uppercase tracking-[0.1em] text-faint">Payload (signature excluded)</p>
        <pre className="mb-4 overflow-x-auto border border-line bg-base p-3 text-xs text-ink">
{JSON.stringify(payload, null, 2)}
        </pre>
        <p className="mb-1 text-[11px] uppercase tracking-[0.1em] text-faint">Canonical bytes</p>
        <pre className="mb-4 overflow-x-auto border border-line bg-base p-3 text-xs text-signal/90">
{canonical}
        </pre>
        {hashPreview && (
          <p className="mb-3 break-all text-xs text-dim">
            content_hash <code className="text-signal/90">{hashPreview}</code>
          </p>
        )}
        <p className="text-xs text-dim">
          Signing with public key <code className="break-all text-signal/90">{keypair?.publicB64}</code>
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
        <Panel label="signing failed" accent="alarm" right="halted">
          <p className="prose-sans text-sm text-alarm">{result.fatal}</p>
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
        accent={submitted ? "signal" : "amber"}
        right={submitted ? "verified by backend" : "backend unreachable"}
      >
        {submitted ? (
          <div className="seal-in">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-signal">
              <span className="blink">●</span> signed &amp; submitted to /verify
            </div>
            <p className="mt-3 text-[11px] uppercase tracking-[0.12em] text-faint">content hash</p>
            <code className="mt-1 block break-all border border-signal/30 bg-base px-3 py-2 text-sm text-signal/90 glow-signal">
              {result.hash}
            </code>
            {verdict && (
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt className="text-faint">designation</dt>
                <dd className="text-ink">{verdict.designation}</dd>
                <dt className="text-faint">canadian content</dt>
                <dd className="text-ink">{verdict.canadian_content_percentage}%</dd>
                <dt className="text-faint">chain valid</dt>
                <dd className={verdict.chain_valid ? "text-signal" : "text-alarm"}>
                  {String(verdict.chain_valid)}
                </dd>
                <dt className="text-faint">anomalies</dt>
                <dd className="text-ink">{(verdict.anomalies || []).length}</dd>
              </dl>
            )}
          </div>
        ) : (
          <p className="prose-sans text-sm text-amber/90">
            The attestation was signed and verified locally, but the POST to the backend failed:{" "}
            <span className="font-mono text-amber">{result.backendError}</span>. The signed body
            below is valid and ready to submit once the backend is reachable.
          </p>
        )}
      </Panel>

      <Panel label="signed body" accent="cyan" right="signature: { algorithm, value }">
        <p className="text-sm text-dim">
          Local signature verification:{" "}
          <span className={result.verified ? "font-semibold text-signal" : "font-semibold text-alarm"}>
            {result.verified ? "valid" : "INVALID"}
          </span>
        </p>
        <pre className="mt-3 overflow-x-auto border border-line bg-base p-3 text-xs text-ink">
{JSON.stringify(result.signedBody, null, 2)}
        </pre>
      </Panel>

      <button type="button" onClick={onReset} className={BTN_GHOST}>
        ↻ author another
      </button>
    </div>
  );
}
