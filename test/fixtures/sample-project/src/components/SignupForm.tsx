import React, { useState } from "react";

export function SignupForm({ onSubmit }: { onSubmit: (data: { name: string; email: string; password: string }) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ name, email, password }); }}>
      <label>Name <input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>Email <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Password <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <button type="submit">Sign up</button>
    </form>
  );
}
