import { Studio } from './ui/Studio';

export default function App() {
  return <Studio />;
}

// role: application root — mounts the studio shell.
// invariants: no engine or state logic here; the studio owns the canvas lifecycle.
// owner milestone: M6
