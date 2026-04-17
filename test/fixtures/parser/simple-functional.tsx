// test/fixtures/parser/simple-functional.tsx
import React from "react";

interface GreetingProps {
  name: string;
  greeting?: string;
}

export const Greeting = ({ name, greeting = "Hello" }: GreetingProps) => {
  return <div className="greeting">{greeting}, {name}!</div>;
};
