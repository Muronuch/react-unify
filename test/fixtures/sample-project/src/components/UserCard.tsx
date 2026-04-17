import React, { useState } from "react";

interface UserCardProps {
  userName: string;
  email: string;
  avatarUrl?: string;
  onSelect?: () => void;
}

export function UserCard({ userName, email, avatarUrl, onSelect }: UserCardProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <div className="card user-card" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onClick={onSelect}>
      {avatarUrl && <img src={avatarUrl} alt={userName} />}
      <div>
        <h3>{userName}</h3>
        <p>{email}</p>
      </div>
      {hovered && <span className="hint">Click to select</span>}
    </div>
  );
}
