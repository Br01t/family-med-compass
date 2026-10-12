# Email con Resend (reset password, conferma registrazione, inviti)

Il servizio email predefinito di Supabase è pensato per i test (pochissime email all'ora).
Per utenti reali serve un SMTP proprio. Questa guida usa Resend.

## 1. Resend
1. Crea l'account e aggiungi un dominio tuo, meglio un sottodominio (es. `mail.tuodominio.it`).
2. Inserisci nel DNS i record che Resend mostra (SPF, DKIM, DMARC) e attendi "Verified".
3. Crea una API key (inizia con `re_`) e conservala: non va mai nel codice né su GitHub.

## 2. Supabase (progetto online) -> Authentication -> SMTP Settings
Abilita "Custom SMTP" e inserisci:

| Campo | Valore |
|---|---|
| Sender email | un indirizzo sul dominio verificato, es. `noreply@mail.tuodominio.it` |
| Sender name | FamilyMed |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | la API key `re_...` |

Poi controlla in Authentication -> Rate Limits il numero di email all'ora e adattalo.

## 3. Supabase -> Authentication -> URL Configuration
- **Site URL**: l'indirizzo reale del sito (es. `https://app.tuodominio.it`).
- **Redirect URLs**: `https://app.tuodominio.it/reset-password` e `https://app.tuodominio.it/**`.
- Non lasciare `localhost` nell'elenco di produzione.

L'app costruisce il link di ritorno come `<indirizzo del sito>/reset-password`: se non è nell'elenco,
Supabase rimanda alla Site URL e il reset non si completa.

## 4. Modello email "Reset Password" (Authentication -> Email Templates)
Oggetto: `Reimposta la tua password di FamilyMed`

```html
<h2>Reimposta la tua password</h2>
<p>Hai richiesto di reimpostare la password di FamilyMed.</p>
<p><a href="{{ .ConfirmationURL }}">Scegli una nuova password</a></p>
<p>Se non sei stato tu, ignora questa email: la tua password non cambia.</p>
```

## 5. Prova finale (con un indirizzo vero)
1. Dal login: "Password dimenticata?" con la tua email.
2. L'email arriva (controlla anche lo spam) e il link porta a `/reset-password`.
3. Imposti la nuova password e accedi con quella.
4. Il link, riaperto una seconda volta, non deve più funzionare.

## Sviluppo locale
In locale le email non escono: arrivano in Mailpit, `http://127.0.0.1:54324`.
`supabase/config.toml` consente `localhost:5173` per i link di ritorno; dopo averlo modificato:
`npx supabase stop` e `npx supabase start`. Non usare `supabase config push` (cambierebbe la configurazione online).

## Da sapere
- Alcuni antivirus/servizi di posta aprono in automatico i link delle email e li "consumano": l'utente vedrebbe
  "Attendo il link di recupero". In quel caso basta richiedere un nuovo link.
- La lunghezza minima della password è 6 caratteri (nel modulo di reset e nella configurazione Supabase):
  conviene alzarla.
