import { useMemo, useState } from "react";
import { canonicalize } from "./lib/canonical.js";
import { validatePayload } from "./lib/validate.js";
import {
  generateKeypair,
  keypairFromPrivateHex,
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

// Shared control-surface button styles.
const BTN_CYAN =
  "inline-flex items-center justify-center gap-2 border border-cyan bg-cyan/10 px-5 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-cyan transition hover:bg-cyan/20 disabled:cursor-not-allowed disabled:opacity-40";
const BTN_SIGNAL =
  "inline-flex items-center justify-center gap-2 border border-signal/60 bg-signal/10 px-6 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-signal transition hover:bg-signal/20 disabled:cursor-not-allowed disabled:opacity-50";
const BTN_GHOST =
  "inline-flex items-center justify-center gap-2 border border-line px-5 py-2 text-sm font-medium uppercase tracking-[0.14em] text-dim transition hover:border-line-bright hover:text-ink disabled:opacity-40";

const inputClass =
  "mt-1 w-full border border-line bg-base px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-cyan focus:outline-none";

function emptyInput() {
  return { attestation_hash: "", quantity_used: "1" };
}

// Default form values matching the spec's worked example.
function defaultForm() {
  return {
    supplier_id: "SUP-ALU",
    output_product_id: "raw_aluminum",
    output_quantity: "1",
    output_unit: "kg",
    inputs: [],
    materials_cents: "500",
    labour_cents: "200",
    work_country: "CA",
    is_substantial_transformation: false,
    timestamp: "2026-05-01T08:00:00Z",
  };
}

// Build the signed-payload object from raw form strings. Numbers are coerced to
// integers; anything non-integer is left as the raw value so validation reports it.
function buildPayload(form) {
  const toInt = (v) => {
    const t = String(v).trim();
    if (t === "" || !/^-?\d+$/.test(t)) return v; // keep raw -> validation fails
    return Number(t);
  };

  return {
    supplier_id: form.supplier_id.trim(),
    output: {
      product_id: form.output_product_id.trim(),
      quantity: toInt(form.output_quantity),
      unit: form.output_unit.trim(),
    },
    inputs: form.inputs.map((i) => ({
      attestation_hash: i.attestation_hash.trim().toLowerCase(),
      quantity_used: toInt(i.quantity_used),
    })),
    materials_cents: toInt(form.materials_cents),
    labour_cents: toInt(form.labour_cents),
    work_country: form.work_country.trim().toUpperCase(),
    is_substantial_transformation: !!form.is_substantial_transformation,
    timestamp: form.timestamp.trim(),
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
  const [result, setResult] = useState(null); // { hash, signedBody, canonical, verified }
  const [selfTest] = useState(() => {
    const r = runCanonicalSelfTest();
    if (r.pass) {
      console.log("[canonical self-test] PASS — matches backend bytes:\n" + r.actual);
    } else {
      console.error("[canonical self-test] FAIL", r);
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

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function updateInput(idx, key, value) {
    setForm((f) => {
      const inputs = f.inputs.slice();
      inputs[idx] = { ...inputs[idx], [key]: value };
      return { ...f, inputs };
    });
  }

  function addInput() {
    setForm((f) => ({ ...f, inputs: [...f.inputs, emptyInput()] }));
  }

  function removeInput(idx) {
    setForm((f) => ({ ...f, inputs: f.inputs.filter((_, i) => i !== idx) }));
  }

  function applyPastedKey() {
    setKeyError("");
    try {
      setKeypair(keypairFromPrivateHex(privInput));
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
      const signedBody = { ...payload, signature };

      setSubmitState({ status: "submitting" });

      let hash = null;
      let backendError = null;
      try {
        const resp = await submitAttestation(signedBody);
        hash = resp.hash ?? null;
      } catch (e) {
        backendError = e.message;
      }

      setResult({ hash, signature, signedBody, canonical: canonicalStr, verified, backendError });
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
      setKeypair(keypairFromPrivateHex(seed));
      setPrivInput(seed);
      update("supplier_id", sid);
    } catch (e) {
      setKeyError(e.message);
    }
  }

  // Apply an AI-drafted attestation to the form. The human still reviews every
  // field and signs — the draft is advisory (build-adopt §4).
  function applyDraft(draft) {
    setForm((f) => ({
      ...f,
      supplier_id: draft.supplier_id ?? f.supplier_id,
      output_product_id: draft.output?.product_id ?? f.output_product_id,
      output_quantity:
        draft.output?.quantity != null ? String(draft.output.quantity) : f.output_quantity,
      output_unit: draft.output?.unit ?? f.output_unit,
      materials_cents:
        draft.materials_cents != null ? String(draft.materials_cents) : f.materials_cents,
      labour_cents: draft.labour_cents != null ? String(draft.labour_cents) : f.labour_cents,
      work_country: draft.work_country ?? f.work_country,
      is_substantial_transformation: !!draft.is_substantial_transformation,
      timestamp: draft.timestamp ?? f.timestamp,
      inputs: Array.isArray(draft.inputs)
        ? draft.inputs.map((i) => ({
            attestation_hash: i.attestation_hash ?? "",
            quantity_used: String(i.quantity_used ?? "1"),
          }))
        : f.inputs,
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
              keypair={keypair}
              privInput={privInput}
              setPrivInput={setPrivInput}
              keyError={keyError}
              applyPastedKey={applyPastedKey}
              regenerateKey={regenerateKey}
              update={update}
              updateInput={updateInput}
              addInput={addInput}
              removeInput={removeInput}
              onContinue={goConfirm}
            />
          </div>
        )}

        {step === STEP_CONFIRM && (
          <ConfirmStep
            payload={payload}
            canonical={canonical}
            keypair={keypair}
            submitState={submitState}
            onBack={() => setStep(STEP_FORM)}
            onConfirm={signAndSubmit}
          />
        )}

        {step === STEP_DONE && <DoneStep result={result} onReset={resetAll} />}
      </main>

      <footer className="mx-auto w-full max-w-3xl px-6 pb-10 text-center text-[11px] uppercase tracking-[0.16em] text-faint">
        backend · <code className="text-dim">{BACKEND_URL}/attestations</code>
      </footer>
    </div>
  );
}

function SelfTestBadge({ selfTest }) {
  if (!selfTest) return null;
  const ok = selfTest.pass;
  return (
    <span
      title={ok ? "Canonical bytes match the backend" : "Canonicalization mismatch — see console"}
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
          Loads a key the registry trusts, so the attestation verifies green.
        </span>
      </label>

      <h3 className="mt-5 mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-cyan">
        Draft with AI <span className="font-normal text-faint">(advisory — you review &amp; sign)</span>
      </h3>
      <textarea
        className={inputClass + " prose-sans h-20"}
        placeholder="e.g. We CNC-milled 50 RAVEN airframes in Ontario, 3 machinists × 6 hrs at $42/hr, from Canadian 6061 billet."
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
    keypair,
    privInput,
    setPrivInput,
    keyError,
    applyPastedKey,
    regenerateKey,
    update,
    updateInput,
    addInput,
    removeInput,
    onContinue,
  } = props;
  const payload = props.payload;

  return (
    <div className="space-y-6">
      <Panel label="attestation" accent="cyan">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Supplier ID">
            <input className={inputClass} value={form.supplier_id} onChange={(e) => update("supplier_id", e.target.value)} placeholder="SUP-ALU" />
          </Field>
          <Field label="Work country" hint="ISO-2 uppercase, e.g. CA">
            <input className={inputClass} value={form.work_country} onChange={(e) => update("work_country", e.target.value)} placeholder="CA" maxLength={2} />
          </Field>
        </div>

        <h3 className="mt-6 mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-dim">Output</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Product ID">
            <input className={inputClass} value={form.output_product_id} onChange={(e) => update("output_product_id", e.target.value)} placeholder="raw_aluminum" />
          </Field>
          <Field label="Quantity" hint="integer">
            <input className={inputClass} value={form.output_quantity} onChange={(e) => update("output_quantity", e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Unit">
            <input className={inputClass} value={form.output_unit} onChange={(e) => update("output_unit", e.target.value)} placeholder="kg" />
          </Field>
        </div>

        <h3 className="mt-6 mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-dim">Cost split</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Materials (cents)" hint="integer cents, e.g. 500 = $5.00">
            <input className={inputClass} value={form.materials_cents} onChange={(e) => update("materials_cents", e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Labour (cents)" hint="integer cents">
            <input className={inputClass} value={form.labour_cents} onChange={(e) => update("labour_cents", e.target.value)} inputMode="numeric" />
          </Field>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Timestamp" hint="ISO-8601 UTC, ends in Z">
            <input className={inputClass} value={form.timestamp} onChange={(e) => update("timestamp", e.target.value)} placeholder="2026-05-01T08:00:00Z" />
          </Field>
          <label className="mt-6 flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="h-4 w-4 border-line bg-base text-cyan accent-cyan focus:ring-cyan"
              checked={form.is_substantial_transformation}
              onChange={(e) => update("is_substantial_transformation", e.target.checked)}
            />
            Substantial transformation occurred
          </label>
        </div>
      </Panel>

      <Panel
        label="inputs consumed"
        accent="cyan"
        right={
          <button type="button" onClick={addInput} className="text-cyan transition hover:text-ink">
            + add input
          </button>
        }
      >
        {form.inputs.length === 0 && (
          <p className="prose-sans text-sm text-faint">No inputs (a raw-material attestation may have none).</p>
        )}
        <div className="space-y-3">
          {form.inputs.map((inp, idx) => (
            <div key={idx} className="flex items-end gap-3">
              <div className="flex-1">
                <Field label={`Input #${idx + 1} — attestation hash`} hint="lowercase hex">
                  <input className={inputClass + " font-mono"} value={inp.attestation_hash} onChange={(e) => updateInput(idx, "attestation_hash", e.target.value)} placeholder="a1b2c3…" />
                </Field>
              </div>
              <div className="w-32">
                <Field label="Qty used" hint="integer">
                  <input className={inputClass} value={inp.quantity_used} onChange={(e) => updateInput(idx, "quantity_used", e.target.value)} inputMode="numeric" />
                </Field>
              </div>
              <button
                type="button"
                onClick={() => removeInput(idx)}
                className="mb-1 border border-alarm/40 bg-alarm/10 px-3 py-2 text-sm font-medium uppercase tracking-[0.1em] text-alarm transition hover:bg-alarm/20"
              >
                remove
              </button>
            </div>
          ))}
        </div>
      </Panel>

      <Panel label="signing key" accent="cyan">
        <p className="prose-sans text-sm text-dim">
          A fresh Ed25519 keypair is generated in your browser. You may paste a 32-byte (64 hex char)
          private key instead.
        </p>
        <dl className="mt-3 space-y-1 text-xs">
          <div className="break-all">
            <span className="font-medium uppercase tracking-[0.1em] text-faint">public key (hex): </span>
            <code className="text-signal/90">{keypair?.publicHex}</code>
          </div>
        </dl>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            className={inputClass + " font-mono"}
            value={privInput}
            onChange={(e) => setPrivInput(e.target.value)}
            placeholder="paste 64-hex-char private key (optional)"
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
        <p className="mb-1 text-[11px] uppercase tracking-[0.1em] text-faint">Assembled payload</p>
        <pre className="mb-4 overflow-x-auto border border-line bg-base p-3 text-xs text-ink">
{JSON.stringify(payload, null, 2)}
        </pre>
        <p className="mb-1 text-[11px] uppercase tracking-[0.1em] text-faint">
          Canonical bytes — one changed byte breaks the signature
        </p>
        <pre className="overflow-x-auto border border-line bg-base p-3 text-xs text-signal/90">
{canonical}
        </pre>
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

function ConfirmStep({ payload, canonical, keypair, submitState, onBack, onConfirm }) {
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
        <p className="mb-1 text-[11px] uppercase tracking-[0.1em] text-faint">Payload</p>
        <pre className="mb-4 overflow-x-auto border border-line bg-base p-3 text-xs text-ink">
{JSON.stringify(payload, null, 2)}
        </pre>
        <p className="mb-1 text-[11px] uppercase tracking-[0.1em] text-faint">Canonical bytes</p>
        <pre className="mb-4 overflow-x-auto border border-line bg-base p-3 text-xs text-signal/90">
{canonical}
        </pre>
        <p className="text-xs text-dim">
          Signing with public key <code className="break-all text-signal/90">{keypair?.publicHex}</code>
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
  return (
    <div className="space-y-6">
      <Panel
        label={submitted ? "attestation issued" : "signed locally"}
        accent={submitted ? "signal" : "amber"}
        right={submitted ? "accepted" : "backend unreachable"}
      >
        {submitted ? (
          <div className="seal-in">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-signal">
              <span className="blink">●</span> accepted by verifier
            </div>
            <p className="mt-3 text-[11px] uppercase tracking-[0.12em] text-faint">content hash</p>
            <code className="mt-1 block break-all border border-signal/30 bg-base px-3 py-2 text-sm text-signal/90 glow-signal">
              {result.hash}
            </code>
          </div>
        ) : (
          <p className="prose-sans text-sm text-amber/90">
            The payload was signed and verified locally, but the POST to the backend failed:{" "}
            <span className="font-mono text-amber">{result.backendError}</span>. The signed body
            below is valid and ready to submit once the backend is reachable.
          </p>
        )}
      </Panel>

      <Panel label="signed body" accent="cyan" right="posted to /attestations">
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
