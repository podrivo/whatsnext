"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../page.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Login failed");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.main}>
      <p className={styles.eyebrow}>WhatsNext</p>
      <h1 className={styles.title}>Sign in</h1>
      <p className={styles.lede}>Private daily coach. Password required.</p>
      <form className={styles.form} onSubmit={onSubmit}>
        <label className={styles.label}>
          Password
          <input
            className={styles.input}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            required
          />
        </label>
        {error && <p className={styles.error}>{error}</p>}
        <button className={styles.primary} type="submit" disabled={busy}>
          {busy ? "…" : "Enter"}
        </button>
      </form>
    </main>
  );
}
