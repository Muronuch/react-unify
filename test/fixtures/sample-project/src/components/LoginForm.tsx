import React, { useState } from "react";

export function LoginForm({ onSubmit }: { onSubmit: (data: { email: string; password: string }) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ email, password }); }}>
      <label>Email <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Password <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <button type="submit">Log in</button>
    </form>
  );
}
