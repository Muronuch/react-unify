import React from "react";

export const Header = ({ title }: { title: string }) => <h1>{title}</h1>;
export const Footer = () => <footer>©</footer>;

export default function Page({ title }: { title: string }) {
  return (
    <div>
      <Header title={title} />
      <main>content</main>
      <Footer />
    </div>
  );
}
