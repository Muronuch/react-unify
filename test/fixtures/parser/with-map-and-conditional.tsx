import React from "react";

interface Item { id: string; name: string; }
interface ListProps { items: Item[]; emptyMessage?: string; }

export function ItemList({ items, emptyMessage }: ListProps) {
  return (
    <ul>
      {items.length === 0 && <li>{emptyMessage ?? "No items"}</li>}
      {items.map((it) => (
        <li key={it.id}>{it.name}</li>
      ))}
    </ul>
  );
}
