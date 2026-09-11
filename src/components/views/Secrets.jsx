import { useState } from 'react';
import { uid } from '../../lib/util.js';
import { useSyncedField } from '../../lib/useSyncedField.js';

function SecretCard({ s, mutate }) {
  const [secret, setSecret, secretRef] = useSyncedField(s.secret);
  const [chars, setChars, charsRef] = useSyncedField(s.chars);
  const [players, setPlayers, playersRef] = useSyncedField(s.players);

  const patch = (fn) =>
    mutate((st) => { const x = st.secrets.find((y) => y.id === s.id); if (x) fn(x); });

  return (
    <div className="card">
      <label className="flabel">
        Secret
        <textarea
          ref={secretRef}
          className="finput finput--area" placeholder="Le secret…"
          value={secret}
          onChange={(e) => { const v = e.target.value; setSecret(v); patch((x) => { x.secret = v; }); }}
          onBlur={() => patch((x) => { x.secret = secret; })}
        />
      </label>
      <label className="flabel">
        Personnages au courant
        <input
          ref={charsRef}
          className="finput" type="text" placeholder="PNJ / personnages au courant"
          value={chars}
          onChange={(e) => { const v = e.target.value; setChars(v); patch((x) => { x.chars = v; }); }}
          onBlur={() => patch((x) => { x.chars = chars.trim(); })}
        />
      </label>
      <label className="flabel">
        Joueur·euses qui savent vraiment
        <input
          ref={playersRef}
          className="finput" type="text" placeholder="Joueur·euses qui le savent réellement"
          value={players}
          onChange={(e) => { const v = e.target.value; setPlayers(v); patch((x) => { x.players = v; }); }}
          onBlur={() => patch((x) => { x.players = players.trim(); })}
        />
      </label>
      <div className="card__actions">
        <button
          className="tbtn" type="button"
          onClick={() => {
            if (!window.confirm('Retirer ce secret ?')) return;
            mutate((st) => { st.secrets = st.secrets.filter((y) => y.id !== s.id); });
          }}
        >
          retirer
        </button>
      </div>
    </div>
  );
}

export default function Secrets({ state, mutate }) {
  const secrets = state.secrets || [];
  return (
    <section className="chapter">
      <div className="chapter__head">
        <h2>Gestion des secrets<span className="count"> ({secrets.length})</span></h2>
        <button
          className="tbtn" type="button"
          onClick={() => mutate((s) => { s.secrets.push({ id: uid(), secret: '', chars: '', players: '' }); })}
        >
          ＋ nouveau secret
        </button>
      </div>

      {!secrets.length ? (
        <p className="empty">
          Un secret → les personnages qui le connaissent → les joueur·euses qui le savent vraiment.
        </p>
      ) : (
        <div className="cards">
          {secrets.map((s) => <SecretCard key={s.id} s={s} mutate={mutate} />)}
        </div>
      )}
    </section>
  );
}
