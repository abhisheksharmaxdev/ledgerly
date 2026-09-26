import { CircleCheck, Lock, UserPlus } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { PASSWORD_MIN, fieldErrors, loginSchema, signupSchema } from "../../../shared/schemas";
import { useNavigate } from "react-router";
import { ApiError, errorMessage } from "../api/client";
import { useLogin, useSignup } from "../api/queries";
import { Segmented } from "../components/ui/Segmented";
import { cn } from "../utils/cn";

type Mode = "login" | "signup";

export default function Login() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);

  return (
    <div className="login">
      <div className="backdrop" aria-hidden="true" />
      <div className="login__card card card--raised">
        <div className="card__inner">
          <span className="brand__mark brand__mark--lg" aria-hidden="true">
            {mode === "login" ? <Lock size={22} /> : <UserPlus size={22} />}
          </span>
          <h1 className="login__title">Ledgerly</h1>
          <p className="muted">{mode === "login" ? "Sign in to open your finances." : "Request an account. An administrator will review it."}</p>

          {submitted ? (
            <div className="auth-success" role="status">
              <CircleCheck size={20} aria-hidden="true" />
              <div>
                <p className="auth-success__title">Request sent</p>
                <p className="muted small">{submitted}</p>
              </div>
            </div>
          ) : (
            <Segmented
              label="Sign in or create an account"
              value={mode}
              onChange={setMode}
              options={[
                { value: "login", label: "Sign in" },
                { value: "signup", label: "Create account" },
              ]}
            />
          )}

          {submitted ? (
            <button
              type="button"
              className="btn btn--primary btn--block"
              onClick={() => {
                setSubmitted(null);
                setMode("login");
              }}
            >
              Back to sign in
            </button>
          ) : mode === "login" ? (
            <LoginForm key="login" email={email} setEmail={setEmail} />
          ) : (
            <SignupForm key="signup" email={email} setEmail={setEmail} onDone={setSubmitted} />
          )}
        </div>
      </div>
    </div>
  );
}

function LoginForm({ email, setEmail }: { email: string; setEmail: (v: string) => void }) {
  const login = useLogin();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    // After signing in, always land on the dashboard.
    login.mutate(parsed.data, { onSuccess: () => navigate("/", { replace: true }) });
  };

  const serverError = login.error ? errorMessage(login.error) : null;
  const pending = login.error instanceof ApiError && (login.error.code === "pending_approval" || login.error.code === "account_rejected");

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <Field id="login-email" label="Email" error={errors.email}>
        <input
          id="login-email"
          type="email"
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          autoFocus
          aria-invalid={!!errors.email}
        />
      </Field>
      <Field id="login-password" label="Password" error={errors.password}>
        <input
          id="login-password"
          type="password"
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          aria-invalid={!!errors.password}
        />
      </Field>
      {serverError && (
        <p className={cn("callout", pending ? "callout--warning" : "callout--negative")} role="alert">
          {serverError}
        </p>
      )}
      <button type="submit" className="btn btn--primary btn--block" disabled={login.isPending}>
        {login.isPending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

function SignupForm({ email, setEmail, onDone }: { email: string; setEmail: (v: string) => void; onDone: (message: string) => void }) {
  const signup = useSignup();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = signupSchema.safeParse({ email, password });
    const next = parsed.success ? {} : fieldErrors(parsed.error);
    if (!next.password && password !== confirm) next.confirm = "Passwords don't match";
    setErrors(next);
    if (!parsed.success || next.confirm) return;
    signup.mutate(parsed.data, {
      onSuccess: (r) => onDone(r.message),
      onError: (err) => setErrors(err instanceof ApiError && err.fields ? err.fields : { form: errorMessage(err) }),
    });
  };

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <Field id="signup-email" label="Email" error={errors.email}>
        <input
          id="signup-email"
          type="email"
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          autoFocus
          aria-invalid={!!errors.email}
        />
      </Field>
      <Field id="signup-password" label="Password" error={errors.password} hint={`At least ${PASSWORD_MIN} characters.`}>
        <input
          id="signup-password"
          type="password"
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          aria-invalid={!!errors.password}
        />
      </Field>
      <Field id="signup-confirm" label="Confirm password" error={errors.confirm}>
        <input
          id="signup-confirm"
          type="password"
          className="input"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          aria-invalid={!!errors.confirm}
        />
      </Field>
      {errors.form && (
        <p className="callout callout--negative" role="alert">
          {errors.form}
        </p>
      )}
      <button type="submit" className="btn btn--primary btn--block" disabled={signup.isPending}>
        {signup.isPending ? "Sending request…" : "Request account"}
      </button>
    </form>
  );
}

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className={cn("field", error && "has-error")}>
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      {children}
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="muted small">{hint}</p>
      )}
    </div>
  );
}
