import React, { useMemo, useState } from "react";

interface Product { id: string; title: string; }

export function ProductList({ products }: { products: Product[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => products.filter((p) => p.title.toLowerCase().includes(query.toLowerCase())), [products, query]);
  return (
    <div className="list product-list">
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" />
      {filtered.length === 0 && <p>No products</p>}
      <ul>
        {filtered.map((p) => <li key={p.id}>{p.title}</li>)}
      </ul>
    </div>
  );
}
