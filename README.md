# The Zeta-Zeros Interferometer

A 3-D visualization (Three.js) of a thought-experiment diffraction grating whose
slits sit at the non-trivial zeros of the Riemann zeta function — and whose
far-field interference pattern lands on the **primes**.

## The idea

The non-trivial zeros `½ + iγₙ` of ζ(s) and the prime numbers are **Fourier-dual**
(Riemann's explicit formula / the Riemann–Weil formula). A diffraction grating is
a physical optical Fourier transform: under parallel (plane-wave) illumination the
screen shows `|𝓕{aperture}|²`.

Put one slit at each zero height `y = ±γₙ` on the critical line and illuminate it
with parallel light. The far-field amplitude is

```
E(φ) = Σₙ [ e^{ i k yₙ sinφ } + e^{ -i k yₙ sinφ } ] = 2 Σₙ cos(γₙ · v),   v = SPREAD·sinφ
```

which has coherent peaks at `v = log(pᵏ)` — the logarithms of the **prime powers**.
So the bright fringes appear at the primes. Because the zeros come in conjugate
pairs `±γₙ`, the pattern is mirror-symmetric: one wing is labelled `p`, the mirror
wing `1/p`.

A quick numerical check (100 zeros) — `|amp/N|` at the prime logs vs. background:

| location | log 2 | log 3 | log 5 | log 7 | log 11 | background | DC (v=0) |
|----------|-------|-------|-------|-------|--------|-----------|----------|
| `|amp/N|`| 0.18  | 0.24  | 0.28  | 0.28  | 0.28   | 0.036     | 1.00     |

## What you see

- **Right:** a glowing **line source at x → +∞** (parallel to the grating) shooting
  parallel rays at each zero height.
- **Centre (x = 0):** the **grating** — an opaque sheet in the YZ plane with a bright
  slit at every `±γₙ`. The faint critical line (`Re = ½`, `x = 0`) and optical axis
  (`y = 0`) are drawn in the XY plane.
- **Left:** a **curved screen** showing the interference; bright spots are marked with
  their **prime** (upper wing) and **inverse prime 1/p** (lower wing), with `1` at the
  central zeroth order. An intensity profile curve bumps outward from the arc.
- Subtle plane-wave-in / spherical-out **wavefront** hints fill the gap.

## Try it

Drag **“Zero pairs”**. With a few zeros the pattern is fuzzy; as you add more zeros
the prime fringes sharpen and lock onto the labels — the explicit formula converging
before your eyes.

## Run

```bash
npm install
npm run dev      # http://localhost:5173/zeta-spectroscope/
npm run build    # tsc + vite -> dist/
```

## Caveats (honest)

- Fringes land on **prime powers**, so `4 = 2², 8 = 2³, 9 = 3²…` appear too (toggle).
- Few zeros ⇒ broad, noisy peaks; large primes need many zeros to resolve.
- The screen axis is **logarithmic** in the prime coordinate; slits are uniform.
- Intensity discards phase, but the peak *locations* are exact.
