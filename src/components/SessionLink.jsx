/** Petit lien « ↗ Séance X » qui ramène à la séance d'origine dans le Journal. */
export default function SessionLink({ sessions, sessionId, goToSession }) {
  if (!sessionId || !goToSession) return null;
  const s = (sessions || []).find((x) => x.id === sessionId);
  if (!s) return null;
  return (
    <button
      type="button"
      className="backlink"
      onClick={() => goToSession(sessionId)}
      title="Aller à la séance d'origine"
    >
      ↗ {s.title || 'Séance'}
    </button>
  );
}
