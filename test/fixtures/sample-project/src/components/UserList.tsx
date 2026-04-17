import React, { useMemo, useState } from "react";

interface User { id: string; name: string; }

export function UserList({ users }: { users: User[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => users.filter((u) => u.name.toLowerCase().includes(query.toLowerCase())), [users, query]);
  return (
    <div className="list user-list">
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search users" />
      {filtered.length === 0 && <p>No users</p>}
      <ul>
        {filtered.map((u) => <li key={u.id}>{u.name}</li>)}
      </ul>
    </div>
  );
}
