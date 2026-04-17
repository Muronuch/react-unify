import React, { useState } from "react";

interface TeamCardProps {
  teamName: string;
  memberCount: string;
  bannerUrl?: string;
  onJoin?: () => void;
}

export function TeamCard({ teamName, memberCount, bannerUrl, onJoin }: TeamCardProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <div className="card team-card" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onClick={onJoin}>
      {bannerUrl && <img src={bannerUrl} alt={teamName} />}
      <div>
        <h3>{teamName}</h3>
        <p>{memberCount}</p>
      </div>
      {hovered && <span className="hint">Click to join</span>}
    </div>
  );
}
