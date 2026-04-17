import React, { useState } from "react";

export function ContactForm({ onSubmit }: { onSubmit: (data: { name: string; email: string; message: string }) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ name, email, message }); }}>
      <label>Name <input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>Email <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Message <textarea value={message} onChange={(e) => setMessage(e.target.value)} /></label>
      <button type="submit">Send</button>
    </form>
  );
}
