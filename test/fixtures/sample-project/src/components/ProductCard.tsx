import React, { useState } from "react";

interface ProductCardProps {
  productName: string;
  priceLabel: string;
  thumbnailUrl?: string;
  onAdd?: () => void;
}

export function ProductCard({ productName, priceLabel, thumbnailUrl, onAdd }: ProductCardProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <div className="card product-card" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onClick={onAdd}>
      {thumbnailUrl && <img src={thumbnailUrl} alt={productName} />}
      <div>
        <h3>{productName}</h3>
        <p>{priceLabel}</p>
      </div>
      {hovered && <span className="hint">Click to add</span>}
    </div>
  );
}
