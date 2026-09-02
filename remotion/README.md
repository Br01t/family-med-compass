# Remotion — generazione video FAQ/tutorial

Sottoprogetto separato (Bun, non Vite) che genera via codice i video tutorial
mostrati nella guida/FAQ dell'app principale — non un residuo di scaffolding,
è collegato: i file mp4/jpg prodotti qui finiscono in `src/assets/faq/` e
sono importati direttamente da `src/data/faq-videos.ts`.

**Non cancellare questa cartella.** Se mai sparisse, gli import in
`faq-videos.ts` punterebbero a file inesistenti e la build dell'app
principale fallirebbe.

## Quando serve toccarla

Solo quando cambia qualcosa nell'interfaccia dell'app che i tutorial
mostrano (es. redesign di una schermata, nuovo flusso) e i video vanno
riallineati. Per il resto, è "set and forget": i file già renderizzati in
`src/assets/faq/` sono quelli serviti in produzione, questa cartella non
gira mai a runtime.

## Come rigenerare i video

```bash
cd remotion
bun install
bun run render:faq
```

Richiede Chrome headless in locale — Remotion lo scarica da solo al primo
avvio. Se il download è bloccato (proxy aziendale): `bunx remotion browser ensure`.

Lo script (`scripts/render-faq-assets.mjs`) rigenera **tutti** i video del
sito con lo stesso stile visivo condiviso (`remotion/src/theme.ts`,
`remotion/src/components`), scrivendo i file finali direttamente dentro
`src/assets/faq/` — Vite li tratta come asset con fingerprint, quindi il
cache-busting tra un deploy e l'altro è automatico, nessun passo manuale
in più richiesto dopo la rigenerazione.

## Struttura

```
remotion/
  src/
    theme.ts        Stile condiviso (colori, font) tra tutti i video
    components/      Componenti React riutilizzati nelle scene
    scenes/           Scene dei video
    faq/               Composizioni + dati specifici dei tutorial FAQ
    MainVideo.tsx    Composizione del video demo (30s, homepage pubblica)
    Root.tsx          Entry point Remotion (registra tutte le composizioni)
  scripts/
    render-faq-assets.mjs   Script principale: rigenera tutti i video FAQ + demo
```