// Role picker shown after a phone scans the QR and joins a session. Built out in Phase 9.
export function PhoneHome() {
  return (
    <main style={{ padding: '3rem 1.5rem', minHeight: '100vh', textAlign: 'center' }}>
      <h1 style={{ fontSize: 30, background: 'linear-gradient(135deg, var(--c4), var(--c5))', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
        Danza
      </h1>
      <p style={{ color: 'var(--ink-dim)' }}>Únete desde tu teléfono — próximamente: cámara, control remoto, subir video.</p>
    </main>
  );
}
