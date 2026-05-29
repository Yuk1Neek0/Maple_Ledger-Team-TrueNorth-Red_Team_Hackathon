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

// Steps of the supplier flow.
const STEP_FORM = "form";
const STEP_CONFIRM = "confirm";
const STEP_DONE = "done";

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
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500";

export default function App() {
  const [step, setStep] = useState(STEP_FORM);
  const [form, setForm] = useState(defaultForm);
  // Generate a fresh keypair once, lazily, on first render.
  const [keypair, setKeypair] = useState(generateKeypair);
  const [privInput, setPrivInput] = useState("");
  const [keyError, setKeyError] = useState("");
  const [submitState, setSubmitState] = useState({ status: "idle" }); // idle|signing|submitting|done|error
  const [result, setResult] = useState(null); // { hash, signedBody, canonical, verified }
  // Run the canonicalization self-test once and log the outcome.
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
      // Sign the canonical bytes; produce base64 signature.
      const { signature, canonical: canonicalStr } = signPayload(payload, keypair.privateKey);

      // Local sanity: the signature we just produced must verify against our pubkey.
      const verified = verifyPayload(signature, payload, keypair.publicKey);

      // Wire body = payload + signature.
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

      setResult({
        hash,
        signature,
        signedBody,
        canonical: canonicalStr,
        verified,
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

  return (
    <div className="min-h-full bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              Maple Ledger — Supplier
            </h1>
            <p className="text-sm text-slate-500">
              Author, sign (Ed25519), and submit a provenance attestation.
            </p>
          </div>
          <SelfTestBadge selfTest={selfTest} />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
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

      <footer className="mx-auto max-w-3xl px-6 pb-10 text-center text-xs text-slate-400">
        Backend: <code className="text-slate-500">{BACKEND_URL}/attestations</code>
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
      className={
        "rounded-full px-3 py-1 text-xs font-medium " +
        (ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")
      }
    >
      canonical self-test: {ok ? "PASS" : "FAIL"}
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
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-3 text-base font-semibold text-slate-800">Demo tools</h2>

      <label className="block text-left">
        <span className="block text-sm font-medium text-slate-700">Load demo identity</span>
        <select
          className={inputClass}
          defaultValue=""
          onChange={(e) => e.target.value && onLoadIdentity(e.target.value)}
        >
          <option value="" disabled>
            choose a registered supplier…
          </option>
          {ids.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-slate-400">
          Loads a key the registry trusts, so the attestation verifies green.
        </span>
      </label>

      <h3 className="mt-5 mb-2 text-sm font-semibold text-slate-700">
        Draft with AI{" "}
        <span className="font-normal text-slate-400">(advisory — you review &amp; sign)</span>
      </h3>
      <textarea
        className={inputClass + " h-20"}
        placeholder="e.g. We CNC-milled 50 RAVEN airframes in Ontario, 3 machinists × 6 hrs at $42/hr, from Canadian 6061 billet."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={draft}
          disabled={busy || !text.trim()}
          className="rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
        >
          {busy ? "Drafting…" : "Draft with AI"}
        </button>
        {msg && <span className="text-xs text-slate-500">{msg}</span>}
      </div>
    </section>
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
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-slate-800">Attestation</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Supplier ID">
            <input
              className={inputClass}
              value={form.supplier_id}
              onChange={(e) => update("supplier_id", e.target.value)}
              placeholder="SUP-ALU"
            />
          </Field>
          <Field label="Work country" hint="ISO-2 uppercase, e.g. CA">
            <input
              className={inputClass}
              value={form.work_country}
              onChange={(e) => update("work_country", e.target.value)}
              placeholder="CA"
              maxLength={2}
            />
          </Field>
        </div>

        <h3 className="mt-6 mb-2 text-sm font-semibold text-slate-700">Output</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Product ID">
            <input
              className={inputClass}
              value={form.output_product_id}
              onChange={(e) => update("output_product_id", e.target.value)}
              placeholder="raw_aluminum"
            />
          </Field>
          <Field label="Quantity" hint="integer">
            <input
              className={inputClass}
              value={form.output_quantity}
              onChange={(e) => update("output_quantity", e.target.value)}
              inputMode="numeric"
            />
          </Field>
          <Field label="Unit">
            <input
              className={inputClass}
              value={form.output_unit}
              onChange={(e) => update("output_unit", e.target.value)}
              placeholder="kg"
            />
          </Field>
        </div>

        <h3 className="mt-6 mb-2 text-sm font-semibold text-slate-700">Cost split</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Materials (cents)" hint="integer cents, e.g. 500 = $5.00">
            <input
              className={inputClass}
              value={form.materials_cents}
              onChange={(e) => update("materials_cents", e.target.value)}
              inputMode="numeric"
            />
          </Field>
          <Field label="Labour (cents)" hint="integer cents">
            <input
              className={inputClass}
              value={form.labour_cents}
              onChange={(e) => update("labour_cents", e.target.value)}
              inputMode="numeric"
            />
          </Field>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Timestamp" hint="ISO-8601 UTC, ends in Z">
            <input
              className={inputClass}
              value={form.timestamp}
              onChange={(e) => update("timestamp", e.target.value)}
              placeholder="2026-05-01T08:00:00Z"
            />
          </Field>
          <label className="mt-6 flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
              checked={form.is_substantial_transformation}
              onChange={(e) => update("is_substantial_transformation", e.target.checked)}
            />
            Substantial transformation occurred
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">Inputs consumed</h2>
          <button
            type="button"
            onClick={addInput}
            className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            + Add input
          </button>
        </div>
        {form.inputs.length === 0 && (
          <p className="text-sm text-slate-400">
            No inputs (a raw-material attestation may have none).
          </p>
        )}
        <div className="space-y-3">
          {form.inputs.map((inp, idx) => (
            <div key={idx} className="flex items-end gap-3">
              <div className="flex-1">
                <Field label={`Input #${idx + 1} — attestation hash`} hint="lowercase hex">
                  <input
                    className={inputClass}
                    value={inp.attestation_hash}
                    onChange={(e) => updateInput(idx, "attestation_hash", e.target.value)}
                    placeholder="a1b2c3..."
                  />
                </Field>
              </div>
              <div className="w-32">
                <Field label="Qty used" hint="integer">
                  <input
                    className={inputClass}
                    value={inp.quantity_used}
                    onChange={(e) => updateInput(idx, "quantity_used", e.target.value)}
                    inputMode="numeric"
                  />
                </Field>
              </div>
              <button
                type="button"
                onClick={() => removeInput(idx)}
                className="mb-1 rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-base font-semibold text-slate-800">Signing key</h2>
        <p className="text-sm text-slate-500">
          A fresh Ed25519 keypair is generated in your browser. You may paste a 32-byte
          (64 hex char) private key instead.
        </p>
        <dl className="mt-3 space-y-1 text-xs">
          <div className="break-all">
            <span className="font-medium text-slate-600">public key (hex): </span>
            <code className="text-slate-800">{keypair?.publicHex}</code>
          </div>
        </dl>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            className={inputClass + " font-mono"}
            value={privInput}
            onChange={(e) => setPrivInput(e.target.value)}
            placeholder="paste 64-hex-char private key (optional)"
          />
          <button
            type="button"
            onClick={applyPastedKey}
            disabled={!privInput.trim()}
            className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
          >
            Use key
          </button>
          <button
            type="button"
            onClick={regenerateKey}
            className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            Regenerate
          </button>
        </div>
        {keyError && <p className="mt-2 text-sm text-red-600">{keyError}</p>}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-base font-semibold text-slate-800">Live preview</h2>
        <p className="mb-1 text-xs font-medium text-slate-500">Assembled payload</p>
        <pre className="mb-4 overflow-x-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
{JSON.stringify(payload, null, 2)}
        </pre>
        <p className="mb-1 text-xs font-medium text-slate-500">
          Canonical bytes (what gets signed)
        </p>
        <pre className="overflow-x-auto rounded-md bg-slate-100 p-3 text-xs text-slate-700">
{canonical}
        </pre>
      </section>

      {!validation.valid && (
        <section className="rounded-lg border border-red-200 bg-red-50 p-4">
          <h3 className="text-sm font-semibold text-red-700">Fix before continuing</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-600">
            {validation.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onContinue}
          disabled={!validation.valid}
          className="rounded-md bg-red-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Review &amp; sign
        </button>
      </div>
    </div>
  );
}

function ConfirmStep({ payload, canonical, keypair, submitState, onBack, onConfirm }) {
  const busy = submitState.status === "signing" || submitState.status === "submitting";
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <h2 className="text-base font-semibold text-amber-800">Confirm before signing</h2>
        <p className="mt-1 text-sm text-amber-700">
          Review the exact payload below. Once signed, any change to a single byte
          invalidates the signature. This is what will be signed and submitted.
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="mb-1 text-xs font-medium text-slate-500">Payload</p>
        <pre className="mb-4 overflow-x-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
{JSON.stringify(payload, null, 2)}
        </pre>
        <p className="mb-1 text-xs font-medium text-slate-500">Canonical bytes</p>
        <pre className="mb-4 overflow-x-auto rounded-md bg-slate-100 p-3 text-xs text-slate-700">
{canonical}
        </pre>
        <p className="text-xs text-slate-500">
          Signing with public key{" "}
          <code className="break-all text-slate-700">{keypair?.publicHex}</code>
        </p>
      </section>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="rounded-md bg-slate-100 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-40"
        >
          Back to edit
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="rounded-md bg-red-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-60"
        >
          {submitState.status === "signing"
            ? "Signing…"
            : submitState.status === "submitting"
            ? "Submitting…"
            : "Sign & submit"}
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
        <section className="rounded-lg border border-red-200 bg-red-50 p-6">
          <h2 className="text-base font-semibold text-red-700">Signing failed</h2>
          <p className="mt-1 text-sm text-red-600">{result.fatal}</p>
        </section>
        <button
          type="button"
          onClick={onReset}
          className="rounded-md bg-slate-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          Start over
        </button>
      </div>
    );
  }

  const submitted = !result.backendError;
  return (
    <div className="space-y-6">
      <section
        className={
          "rounded-lg border p-6 " +
          (submitted ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50")
        }
      >
        <h2
          className={
            "text-base font-semibold " + (submitted ? "text-green-800" : "text-amber-800")
          }
        >
          {submitted ? "Attestation accepted" : "Signed locally — backend unreachable"}
        </h2>
        {submitted ? (
          <p className="mt-2 text-sm text-green-700">
            Backend returned hash:
            <br />
            <code className="mt-1 inline-block break-all rounded bg-white px-2 py-1 text-green-900">
              {result.hash}
            </code>
          </p>
        ) : (
          <p className="mt-2 text-sm text-amber-700">
            The payload was signed and verified locally, but the POST to the backend
            failed: <span className="font-mono">{result.backendError}</span>. The signed
            body below is valid and ready to submit once the backend is reachable.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">
          Local signature verification:{" "}
          <span
            className={
              result.verified ? "font-semibold text-green-700" : "font-semibold text-red-700"
            }
          >
            {result.verified ? "valid" : "INVALID"}
          </span>
        </p>
        <p className="mt-3 mb-1 text-xs font-medium text-slate-500">
          Signed body (payload + signature) — sent to POST /attestations
        </p>
        <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
{JSON.stringify(result.signedBody, null, 2)}
        </pre>
      </section>

      <button
        type="button"
        onClick={onReset}
        className="rounded-md bg-slate-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
      >
        Author another
      </button>
    </div>
  );
}
