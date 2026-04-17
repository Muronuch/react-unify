// test/fixtures/parser/with-hooks.tsx
import React, { useEffect, useState } from "react";

export function Counter({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial);
  useEffect(() => {
    document.title = `Count: ${count}`;
  }, [count]);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
