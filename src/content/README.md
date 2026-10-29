# Content

Data tables for the simulation: species, cultures, creatures, items, spells,
names, and so on. Content is plain data, never logic, and every entry carries a
culture tag (`docs/ARCHITECTURE.md` §4.7).

The same lint rules as `src/sim/` apply here: no DOM, no Node built-ins, no
`Math.random()`.
