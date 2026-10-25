import ScoringRules from '@/components/ScoringRules';

export const metadata = { title: 'Rules & scoring · O/U Draft' };

export default function Rules() {
  return (
    <main className="wrap" style={{ maxWidth: 720 }}>
      <section className="card">
        <h1>Rules & scoring</h1>
        <ScoringRules />
      </section>
    </main>
  );
}
