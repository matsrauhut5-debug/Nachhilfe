# Nachhilfe-Buchung – Projektanleitung für Claude Code

Dieses Dokument beschreibt vollständig, was gebaut werden soll, wie es aufgebaut ist und in welcher Reihenfolge wir vorgehen. Claude Code liest diese Datei bei jedem Start automatisch. Sie ist die verbindliche Quelle für alle Entscheidungen. Wenn etwas hier nicht geregelt ist: nachfragen, nicht raten.

---

## 0. Für Mats: So startest du

1. Claude Code installieren (Anleitung: https://docs.claude.com/en/docs/claude-code) und einen leeren Ordner anlegen, z. B. `nachhilfe`.
2. Diese Datei (`CLAUDE.md`) und den Ordner `design/` (mit `prototyp.html`) in diesen Ordner legen.
3. Im Ordner Claude Code starten und schreiben: **„Lies die CLAUDE.md und starte mit Phase 0.“**
4. Claude Code führt dich Schritt für Schritt durch. Nach jeder Phase testest du kurz und sagst „Weiter mit Phase X“.

---

## 1. Arbeitsweise für Claude Code (wichtig)

- **Der Nutzer (Mats) ist kein Entwickler.** Erkläre jeden Schritt kurz auf Deutsch in einfachen Worten. Wenn Mats etwas selbst tun muss (Konto anlegen, Knopf im Dashboard drücken, Schlüssel kopieren), gib eine nummerierte Klick-für-Klick-Anleitung und warte auf seine Bestätigung.
- **Kleine Schritte.** Arbeite Phase für Phase (Abschnitt 13). Jede Phase endet mit etwas, das Mats im Browser ausprobieren kann, und mit einer kurzen Testanleitung.
- **Nichts Geheimes ins Repository.** Das Repository ist öffentlich. Service-Role-Key, Gmail-App-Passwort, Backup-Secret usw. gehören ausschließlich in Supabase-Secrets bzw. GitHub-Secrets. Nur `SUPABASE_URL` und der `anon`-Key dürfen im Frontend stehen (die sind absichtlich öffentlich; die Sicherheit kommt aus Row Level Security). Lege eine `.env.example` ohne echte Werte an und setze `.env` in `.gitignore`. Prüfe vor jedem Commit, dass keine Geheimnisse enthalten sind.
- **Sicherheit liegt in der Datenbank, nicht in der Oberfläche.** Alles, was Familien nicht dürfen, muss per RLS bzw. in den Server-Funktionen verhindert werden – nicht nur durch ausgeblendete Knöpfe.
- **Sprache (Entscheidung von Mats, Phase 3 – hat Vorrang vor allen anderen Angaben in diesem Dokument):** Die **gesamte Software ist auf Englisch** – Familien-Ansicht, Admin-Ansicht, Fehlermeldungen, E-Mails, Export-Spaltenköpfe, Routen. Deutsche Texte, Beispiele und Zahlenformate in diesem Dokument und im Prototyp sind sinngemäß ins Englische zu übertragen (z. B. „Termin buchen“ → „Book lesson“). Zahlen/Daten im englischen Format: `HK$ 1,300` bzw. `HK$ 420.50`, „Mon, 5 Oct“, 24-Stunden-Zeit. Code ebenfalls Englisch.
- **Der Chat mit Mats bleibt auf Deutsch.**
- **Einfachheit vor Features.** Keine zusätzlichen Bibliotheken, Einstellungen oder Funktionen, die hier nicht verlangt sind. Lieber nachfragen.
- Nach jeder Phase: committen und pushen (Deploy läuft automatisch), dann Mats den Link zum Testen nennen.

---

## 2. Ziel des Projekts

Mats gibt Nachhilfe. Familien (Eltern + Schüler, **ein gemeinsames Konto pro Familie**) sollen ihre Termine selbst online buchen und absagen können. Mats legt nur seine verfügbaren Zeiten fest und hat eine Übersicht über alle Termine und Zahlungen. Alles soll so einfach wie möglich sein – besonders für die Familien: Uhrzeit antippen, bestätigen, fertig.

**Kernfunktionen**
- Familien sehen nur freie Zeiten, buchen einzelne oder wöchentlich wiederkehrende Termine und sagen selbst ab (bis zu einer Frist).
- Mats hat eine Admin-Ansicht: Kalender wie Apple Kalender, Standardzeiten, Zeiten pro Woche freigeben/blockieren, Schüler & Preise, Zahlungsübersicht.
- Alle Buchungen erscheinen automatisch in Mats' **Apple Kalender** (Kalender-Abo).
- **E-Mails** bei Buchung und Absage an Mats **und** die Familie.
- Zahlungen: Status „offen/bezahlt“ pro Stunde, Monatsübersicht, Knopf „Für Google Sheet kopieren“.

---

## 3. Design-Vorlage

`design/prototyp.html` ist ein klickbarer Prototyp (nur Frontend, speichert lokal). **Er ist die verbindliche Vorlage für Aussehen, Texte und Abläufe.** Übernimm daraus:
- Farben (CSS-Variablen in `:root`, inkl. Dark Mode), Schriften (Fraunces für Überschriften, Hanken Grotesk für Text), Abstände, Karten, Knöpfe, Modals, Toasts.
- Die Abläufe der Schüleransicht und der vier Admin-Tabs.
- Die Logik für Zeiten-Raster, Malen/Tippen zum Freigeben/Blockieren, Monatsansicht, Zahlungs-Tabelle, TSV-Kopie.

Nicht übernehmen: die gelbe Demo-Leiste (Rollen-Umschalter) und die Beispieldaten – die ersetzt der echte Login bzw. die Datenbank.

**Update (Mats, Phase 6):** Der Prototyp ist ein Ausgangspunkt, **nicht fix**. Claude darf Layout und Grafik verbessern, wenn es übersichtlicher oder schöner wird (z. B. „Students & prices“ als moderne Tabelle statt Karten, geplant direkt nach Phase 6). Größere Umbauten kurz vorher mit Mats abstimmen.

Das Design soll ruhig bleiben: wenige Farben, gedämpfte Schülerfarben (Palette aus dem Prototyp), mobil zuerst (die meisten Familien nutzen das Handy).

---

## 4. Architektur & Dienste

| Baustein | Dienst | Zweck | Kosten |
|---|---|---|---|
| Code + Webseite | **GitHub** (öffentliches Repo) + **GitHub Pages** | Code-Verwaltung, Hosting unter `https://<user>.github.io/<repo>/` | kostenlos |
| Datenbank, Logins, Server-Funktionen | **Supabase** (Free Plan) | Postgres, Auth, Row Level Security, Edge Functions | kostenlos |
| E-Mail-Versand | **Gmail** über SMTP mit App-Passwort | Einladungen, Passwort-Reset, Buchungs-/Absage-Mails, monatlicher Zahlungsbericht | kostenlos |
| Automatische Helfer | **GitHub Actions** | Deploy, Keep-alive (gegen Pausieren), monatlicher Zahlungsbericht | kostenlos |

**Warum Gmail statt eines E-Mail-Dienstes wie Resend:** Solche Dienste können ohne eigene Domain nur an die eigene Adresse senden. Mats hat bewusst keine eigene Domain. Gmail mit App-Passwort funktioniert ohne Domain.

**Projektdaten (in Phase 0 festgelegt)**
- GitHub: `matsrauhut5-debug/Nachhilfe` → Webseite `https://matsrauhut5-debug.github.io/Nachhilfe/`, also `base: '/Nachhilfe/'`
- Supabase-Projekt „Nachhilfe“, Ref `hmwlenyiqzeucoahrzro`, Region `eu-west-1`
- Anzeigename: „Mats“

**Frontend-Technik**
- Vite + React + TypeScript, `@supabase/supabase-js`. Keine UI-Bibliothek; CSS aus dem Prototyp übernehmen.
- **HashRouter** (Routen wie `#/admin`), damit GitHub Pages bei Neuladen keine 404-Seite zeigt.
- `vite.config.ts`: `base: '/<repo-name>/'`.
- Build-Variablen: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (in GitHub als Repository-Variablen hinterlegt).

**Backend-Technik**
- SQL-Migrationen in `supabase/migrations/`, anwenden mit Supabase CLI (`supabase db push`).
- Edge Functions (Deno/TypeScript) in `supabase/functions/`, deployen mit `supabase functions deploy`.
- Hinweis: Edge Functions dürfen ausgehend nicht über Port 25/587 verbinden. Für Gmail **Port 465 (SMTP über TLS)** verwenden. Vor dem Bau der E-Mail-Funktion kurz in der aktuellen Supabase-Doku prüfen.

**Ordnerstruktur**
```
/CLAUDE.md
/design/prototyp.html
/.env.example
/index.html, /vite.config.ts, /package.json, /tsconfig.json
/src/
  main.tsx, App.tsx, supabase.ts, styles.css
  lib/        (Datum/Zeit, Geldformat, Slot-Logik)
  auth/       (Login, Passwort setzen/vergessen, Rollen-Weiche)
  family/     (Schüleransicht)
  admin/      (Kalender, Standardzeiten, Schüler, Zahlungen)
/supabase/
  migrations/*.sql
  functions/
    invite-family/
    username-login/
    send-notification/
    calendar-feed/
    monthly-report/
/.github/workflows/
  deploy.yml, keepalive.yml, monthly-report.yml
```

---

## 5. Rollen, Zugang & Sicherheit

**Zwei Rollen:** `admin` (nur Mats) und `family`.

- **Keine Selbstregistrierung.** In Supabase Auth „Allow new users to sign up“ **deaktivieren**. Familien werden nur von Mats eingeladen.
- **Admin-Konto:** Mats wird einmalig im Supabase-Dashboard angelegt; danach per SQL `role = 'admin'` gesetzt (Claude Code gibt Mats die genaue Anleitung).
- **Login:** E-Mail **oder Benutzername** + Passwort (Benutzername optional, von Mats vergeben, steht in der Einladungs-Mail; Edge Function `username-login` sucht die E-Mail serverseitig, die Webseite erfährt sie nie). Gesperrte Konten sehen: „Your account has been deactivated. Please reach out to Mats.“ Einladung per E-Mail → Link → „Passwort festlegen“-Seite. „Passwort vergessen“ über Supabase Reset-Mail.
- **Eine App, eine Adresse.** Nach dem Login entscheidet die Rolle aus der Datenbank, welche Ansicht erscheint (`#/admin` oder `#/book`). Ruft eine Familie `#/admin` auf, wird sie umgeleitet – und bekommt ohnehin keine Daten, weil RLS alles blockiert.
- Hilfsfunktion `is_admin()` (SQL, `security definer`, liest die Rolle des aktuellen Nutzers).
- Empfehlung für Mats: starkes Passwort; optional Zwei-Faktor-Anmeldung später.

---

## 6. Geschäftsregeln (verbindlich)

| Regel | Wert |
|---|---|
| Währung | **HKD**, Anzeige `HK$ 1,300` bzw. `HK$ 420.50` (englisches Zahlenformat) |
| Zeitzonen | Siehe **„Zeitzonen“** unten (in Phase 0 mit Mats geklärt) |
| Dauer | nur **60, 90 oder 120 Minuten** |
| Startzeiten | im **30-Minuten-Raster** (intern, keine Einstellung dafür) |
| Pausen zwischen Stunden | **keine** |
| Buchbar im Voraus | Einzeltermine bis **12 Wochen** voraus; Serien bis max. **52 Wochen** |
| Kostenlose Absage durch Familie | bis **24 Std.** vorher (Einstellung: 12/24/48, Standard 24) |
| Später absagen (Update Phase 10) | Familien können auch innerhalb der Frist selbst absagen → Status `late`, **50 % des Preises** werden berechnet (Hinweis vorher im Dialog). Mats kann `late` ebenfalls setzen (50 %) oder normal absagen (kostenlos, z. B. beim Verschieben). Die Zeit einer `late`-Stunde ist wieder frei; im Kalender wird sie nur blass angezeigt. |
| Preis | pro Familie drei Preise (60/90/120). Bei Buchung wird der Preis **in die Buchung kopiert**; spätere Preisänderungen ändern bestehende Buchungen nicht |
| Serie | „Jede Woche zu dieser Zeit“ bis zu einem Enddatum. Wochen, die nicht frei sind, werden übersprungen und vorher angezeigt |
| Doppelbuchung | darf technisch unmöglich sein (Datenbank-Constraint, siehe 7) |
| Vergangene Zeiten | nicht buchbar |

**Zeitzonen** (Mats ist in Europa, die Familien in Hongkong)
- **Heimatzeit von Mats:** `Europe/Berlin` (mit Sommer-/Winterzeit), gespeichert in `settings.timezone`, nie hart im Code verteilt. Standardzeiten, Tagesanpassungen und das 30-Min-Raster gelten in dieser Zeitzone.
- **Admin-Ansicht:** zeigt immer die Heimatzeit aus `settings.timezone`, egal wo Mats' Gerät gerade ist. In allen Zeitrastern steht links daneben eine zweite Zeitspalte in anderer Farbe (`settings.second_timezone`, Standard Hongkong).
- **Familien-Ansicht:** zeigt alle Zeiten in der **Zeitzone des Geräts** (Browser, `Intl.DateTimeFormat().resolvedOptions().timeZone`). Tage werden nach dem Ortsdatum der Familie gruppiert (ein Abendtermin bei Mats kann bei der Familie am nächsten Morgen liegen). Kleiner Hinweis in der Ansicht: „Alle Zeiten in deiner Ortszeit (Hongkong)“.
- **Serien** sind an **Mats' Uhrzeit** gebunden: jede Woche gleiche Uhrzeit in `settings.timezone`. Für Familien in Hongkong verschiebt sich der Termin bei der europäischen Zeitumstellung um 1 Stunde – das muss im Buchungs-Pop-up und in der Serien-Vorschau sichtbar sein (jede Vorschau-Zeit in Ortszeit der Familie anzeigen).
- Server und Datenbank rechnen nur mit `timestamptz` (absolute Zeitpunkte). Umrechnung in Ortszeit passiert erst bei der Anzeige bzw. beim E-Mail-Text.
- **E-Mails:** an die Familie in deren Zeitzone (`profiles.timezone`, Standard `Asia/Hong_Kong`, von Mats im Schülerprofil änderbar), an Mats in seiner Heimatzeit. Zeitzone im Text nennen, z. B. „15:00 Uhr (Hongkong-Zeit)“.
- Der Supabase-Server steht in Irland (`eu-west-1`); das hat mit den Zeitzonen nichts zu tun.

**Verfügbarkeit**
- **Standardzeiten:** Mats' normale Woche (pro Wochentag Zeitfenster). Gilt automatisch jede Woche.
- **Tagesanpassung:** Für ein bestimmtes Datum kann Mats die Zeiten ändern (freigeben/blockieren, ganzen Tag blockieren). Existiert eine Anpassung, **ersetzt** sie die Standardzeiten dieses Tages komplett. „Auf Standard zurücksetzen“ löscht die Anpassung. Ist eine Anpassung identisch mit dem Standard, wird sie automatisch gelöscht.
- Blockiert Mats Zeit, in der schon ein Termin liegt, bleibt der Termin bestehen (Hinweis anzeigen).

---

## 7. Datenmodell (Supabase / Postgres)

Alle Tabellen mit RLS aktiviert. Zeitpunkte als `timestamptz`, Tageszeiten als Minuten seit Mitternacht (`int`, z. B. 15:30 = 930) in der Zeitzone aus `settings`.

```sql
-- Profile (1:1 zu auth.users)
profiles (
  id uuid primary key references auth.users on delete cascade,
  role text not null check (role in ('admin','family')) default 'family',
  student_name text,          -- z. B. "Mia Berger"
  username text unique,       -- optional, klein geschrieben, z. B. "mia" (3–30 Zeichen a-z 0-9 . _ -)
  email text not null,
  color text,                 -- aus der Palette, automatisch vergeben
  price_60 numeric(10,2),
  price_90 numeric(10,2),
  price_120 numeric(10,2),
  timezone text not null default 'Asia/Hong_Kong',  -- für E-Mail-Texte an die Familie
  active boolean not null default true,
  created_at timestamptz default now()
)

-- Einstellungen (genau eine Zeile)
settings (
  id int primary key default 1 check (id = 1),
  cancel_hours int not null default 24 check (cancel_hours in (12,24,48)),
  timezone text not null default 'Europe/Berlin',   -- Heimatzeit von Mats
  ics_token text not null,    -- zufälliger geheimer Token für den Kalender-Link
  admin_email text not null,
  second_timezone text not null default 'Asia/Hong_Kong'  -- zweite Zeitspalte in Mats' Rastern
)

-- Standardzeiten: Fenster pro Wochentag (0 = Sonntag … 6 = Samstag)
availability_template (
  id bigint generated always as identity primary key,
  weekday smallint not null check (weekday between 0 and 6),
  start_min int not null, end_min int not null,
  check (start_min % 30 = 0 and end_min % 30 = 0 and start_min < end_min)
)

-- Tagesanpassung: ersetzt die Standardzeiten für dieses Datum komplett
availability_override (
  date date primary key,
  windows jsonb not null      -- z. B. [[600,780]]; [] = ganzer Tag blockiert
)

-- Buchungen
bookings (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references profiles(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,           -- per Trigger aus starts_at + duration_min
  duration_min int not null check (duration_min in (60,90,120)),
  series_id uuid,                          -- gleich für alle Termine einer Serie
  status text not null default 'booked' check (status in ('booked','cancelled','late')),
  price numeric(10,2) not null,            -- HKD, Kopie zum Buchungszeitpunkt
  paid boolean not null default false,
  created_at timestamptz default now(),
  created_by uuid,
  cancelled_at timestamptz,
  cancelled_by uuid,
  exclude using gist (tstzrange(starts_at, ends_at) with &&) where (status = 'booked')
)

-- Ausgang für E-Mails (ein Eintrag pro Aktion, Serien = ein Eintrag)
notifications_outbox (
  id bigint generated always as identity primary key,
  kind text not null,          -- 'booked' | 'series_booked' | 'cancelled' | 'series_ended'
  family_id uuid not null,
  payload jsonb not null,      -- Termine, Zeiten, Beträge für den E-Mail-Text
  created_at timestamptz default now(),
  sent_at timestamptz,
  error text
)
```

**RLS-Regeln (Kurzfassung)**
- `profiles`: Familie liest nur die eigene Zeile; keine Schreibrechte für Familien. Admin: alles.
- `settings`, `availability_template`, `availability_override`: nur Admin (lesen & schreiben). Familien greifen **nicht direkt** darauf zu, sondern nur über `get_free_starts`.
- `bookings`: Familie liest nur eigene Buchungen; **kein direktes Einfügen/Ändern** durch Familien (nur über die RPC-Funktionen). Admin: alles.
- `notifications_outbox`: kein Zugriff für Familien; Admin nur lesen.
- `ics_token` darf nie an Familien gelangen.

---

## 8. Server-Funktionen

### 8.1 SQL-Funktionen (RPC, `security definer`, prüfen den Aufrufer selbst)

- **`get_free_starts(p_from timestamptz, p_to timestamptz)`** → Liste `(starts_at timestamptz, max_duration int)`.
  Berechnet freie Startzeiten aus Standardzeiten bzw. Tagesanpassung (in `settings.timezone`) minus gebuchte Termine (Status `booked`), nur Zukunft, 30-Min-Raster. `max_duration` = längste der Dauern 60/90/120, die ab diesem Start passt. Gibt **absolute Zeitpunkte** zurück; das Frontend rechnet in die Ortszeit um. Gibt **keine** fremden Namen oder Buchungen preis. Zeitraum max. 12 Wochen.
- **`book_lessons(p_starts_at timestamptz, p_duration int, p_repeat_until timestamptz default null, p_family_id uuid default null)`** – `p_repeat_until` ist ein exklusives Ende (Mitternacht nach dem gewählten Enddatum in der Zeitzone der Familie).
  Nur für aktive Familien (und Admin mit zusätzlichem Parameter `p_family_id`). Serientermine = gleiche Uhrzeit in `settings.timezone`, jeweils +7 Tage (nicht +168 Stunden). Prüft Dauer, Verfügbarkeit und Zukunft für jeden Termin, erzeugt bei mehr als einem Termin eine `series_id`, kopiert den Preis aus dem Profil. Nicht freie Wochen werden übersprungen. Rückgabe: gebuchte und übersprungene Daten. Legt **einen** Eintrag in `notifications_outbox` an. Der Exclusion-Constraint ist die letzte Sicherung gegen gleichzeitige Doppelbuchungen – bei Konflikt verständliche Fehlermeldung („Diese Zeit wurde gerade vergeben“).
- **`preview_series(p_starts_at, p_duration, p_repeat_until)`** → `(starts_at, free)` für die Serien-Vorschau (auch über 12 Wochen hinaus). **`booking_info()`** → `{cancel_hours}` für Familien.
- **`cancel_booking(p_id uuid)`**
  Familie: nur eigene, nur Status `booked`, nur wenn `starts_at - now() > cancel_hours`. Admin: immer. Setzt `cancelled`, `cancelled_at`, `cancelled_by`, legt Outbox-Eintrag an.
- **`end_series(p_series_id uuid, p_from timestamptz default now())`**
  Sagt alle künftigen Termine der Serie ab, die außerhalb der Frist liegen (Admin: alle ab `p_from`). Gibt Anzahl abgesagter und bestehen gebliebener Termine zurück. Ein Outbox-Eintrag.
- **`mark_late_cancel(p_id uuid)`** (nur Admin): Status `late`.
- **`set_template_day(p_weekday, p_windows)`** / **`set_override(p_date, p_windows)`** (nur Admin, `security invoker`): speichern Standardzeiten bzw. Tagesanpassung atomar, fassen Fenster zusammen; `set_override` mit `null` setzt zurück und löscht Anpassungen, die dem Standard gleichen.
- Admin-Aktionen ohne Sonderlogik (Preise, Standardzeiten, Tagesanpassungen, `paid` umschalten, Einstellungen) laufen direkt über Tabellen-Updates mit RLS.

### 8.2 Edge Functions

- **`invite-family`** (nur Admin, prüft JWT + Rolle): legt Nutzer per `auth.admin.inviteUserByEmail` an (Weiterleitung auf `#/set-password`), erstellt die `profiles`-Zeile mit Namen, Preisen und automatisch vergebener Farbe. Auch „Einladung erneut senden“.
- **`send-notification`**: wird per **Database Webhook** bei neuem Eintrag in `notifications_outbox` aufgerufen (Webhook mit geheimem Header absichern). Verschickt über Gmail-SMTP je eine E-Mail an die Familie und an Mats, setzt `sent_at` oder `error`. Umgesetzt als Trigger `outbox_notify` (pg_net) mit URL + Secret aus Supabase Vault (`notify_url`, `webhook_secret`). Mats bekommt **bei jeder Änderung** eine Mail (auch bei eigenen Aktionen). Sagt Mats ab, wählt er den Grund (`bookings.cancel_reason`: 'teacher' = er kann nicht, 'family' = Wunsch der Familie, z. B. per WhatsApp); der Text an die Familie richtet sich danach. Kurzfristige Absage (`late`) erzeugt `late_cancelled`-Mails.
- **`calendar-feed`**: öffentlich erreichbar (JWT-Prüfung aus), aber nur mit korrektem `?token=`. Liefert `text/calendar` (iCalendar) mit allen Terminen mit Status `booked` von −30 bis +180 Tagen. Pro Termin: `UID` = Buchungs-ID, `SUMMARY` = „Nachhilfe: Mia Berger“, `DTSTART/DTEND` in UTC, `DESCRIPTION` mit Dauer, Betrag, Serie ja/nein. Kalenderkopf mit `X-WR-CALNAME:Nachhilfe`, `REFRESH-INTERVAL;VALUE=DURATION:PT15M`, `X-PUBLISHED-TTL:PT15M`. Abgesagte Termine verschwinden beim nächsten Abruf.
- **`monthly-report`** (ersetzt das frühere wöchentliche Backup, Wunsch von Mats): nur mit geheimem Header `x-report-secret`. Am 1. des Monats CSV des Vormonats (alle `booked`/`late`-Stunden) im Format seines Google Sheets: `Name, Betrag, Datum, Status`. Kein Voll-Backup; Elternname wird nicht gespeichert.

### 8.3 Secrets (nie ins Repo)

Supabase Function Secrets: `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `WEBHOOK_SECRET`, `REPORT_SECRET` (Service-Role-Key ist in Edge Functions automatisch verfügbar).
GitHub Secrets: `REPORT_SECRET`, `SUPABASE_FUNCTIONS_URL`. GitHub Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

---

## 9. Ansicht für Familien (`#/book`)

**Aktuelles Layout (Phase 6, auf Wunsch von Mats vereinfacht – hat Vorrang vor der Liste darunter):** Kopf „Hi Mia“ + eine Zeile „Times in Hong Kong time · free cancellation up to 24 h before“; Karte „Next lesson“; zwei Reiter **Book** / **My lessons (n)**. *Book:* Wochen-Pfeile, Tagesleiste mit 7 Tagen (Punkt grün = frei, gold = eigener Termin), darunter nur die Uhrzeiten des gewählten Tages. *My lessons:* schlichte Liste (Datum, Zeit, „weekly“), „Cancel“ bzw. „Message Mats to cancel“; bei Serien-Terminen fragt der Absage-Dialog „Only this lesson“ / „This and all following“ (keine eigenen Serienkarten). Wenig Text.

Ursprüngliche Beschreibung:

1. Kopf: „Nachhilfe bei Mats“, darunter „Familie Berger · Mia“ und „Alle Zeiten in deiner Ortszeit (…)“. Alle Zeiten der Familien-Ansicht in Gerätezeit (siehe Abschnitt 6, Zeitzonen).
2. Karte **„Dein nächster Termin“** (falls vorhanden).
3. Wochenauswahl (‹ Woche ›), aktuelle Woche bis 12 Wochen voraus.
4. Tageskarten nur für Tage mit freien Zeiten oder eigenen Terminen. Freie Startzeiten als Knöpfe (nur Starts, an denen mindestens 60 Min. passen). Eigene Termine als hervorgehobene Karte „Dein Termin“. Fremde Termine sind **nie** sichtbar – die Zeit ist einfach nicht frei.
5. Tippen auf eine Uhrzeit → **Pop-up „Termin buchen“**:
   - Datum, Uhrzeit von–bis, Preis
   - „Wie lange?“: 1 Std. / 1,5 Std. / 2 Std. mit Preis; nicht passende Dauern ausgegraut; **vorausgewählt ist die zuletzt gebuchte Dauer der Familie**
   - Schalter „Jede Woche zu dieser Zeit“ → Enddatum + Schnellwahl (4 Wochen, 12 Wochen, halbes Jahr) + Vorschau „X Termine“ und „Nicht frei, wird übersprungen: …“
   - Knöpfe „Abbrechen“ / „Termin buchen“ bzw. „12 Termine buchen“
6. Nach Erfolg: Toast „Gebucht …“, Ansicht aktualisiert sich; E-Mail geht raus.
7. **„Meine Termine“:** Serien als eigene Zeile mit „Serie beenden“; darunter die nächsten Termine mit „Absagen“ (mit Bestätigungs-Pop-up). Innerhalb der Frist statt Knopf: „Zu kurzfristig zum Absagen. Bitte Mats direkt schreiben.“
8. Hinweis unten: „Absagen ist kostenlos bis 24 Stunden vor dem Termin, zum Beispiel für Ferien.“
9. Kleines Menü: Abmelden, Passwort ändern.

---

## 10. Ansicht für Mats (`#/admin`)

**Aktuelle Struktur (Phase 7, von Mats freigegeben – hat Vorrang vor der Beschreibung darunter):** kompakte Kopfzeile „Tutoring“ + Menü; vier Reiter **Week · Students · Payments · Settings**.
- *Week:* Woche/Monat; Zeile „5 lessons · 7 hrs · HK$ 1,860“ mit „Edit hours“ und „+ Lesson“; am Rechner Zeitraster (DE + HK-Spalte), auf schmalen Bildschirmen (≤700 px) Tagesliste mit Terminen und „Free …“-Zeiten; Tipp auf Termin → Details (Paid-Schalter, Cancel, Late cancellation, End series from here, Don't charge); Tipp auf Tag → Block / Reset / Edit hours.
- *Students:* Tabelle + Bearbeiten-Dialog. *Payments:* Monat, Filter, Summen, Tabelle, „Copy for Google Sheets“ (Spalten Name | Betrag | Datum | Status).
- *Settings:* Usual hours (mit Edit), Free cancellation (12/24/48 h), Apple Calendar (Link, Copy, New link, Anleitung).

Ursprünglich: Vier Tabs wie im Prototyp. Alle Zeiten in Mats' Heimatzeit (`settings.timezone`), unabhängig vom Gerät.

**Kalender**
- Wochenansicht als Zeitraster (Mo–So), freie Zeiten hellgrün hinterlegt, Termine als Blöcke in der Schülerfarbe mit Vorname, Uhrzeit, „bezahlt/offen“. Rote Linie für „jetzt“. Monatsansicht (Tipp auf Tag → Woche).
- Zeile „Diese Woche: 4,5 Std. gebucht · HK$ 1.300“.
- Tipp auf Termin → Details: Familie, Zeit, Dauer, Betrag, Serie, Status; Schalter „Bezahlt“; „Termin absagen“, „Kurzfristige Absage (wird berechnet)“, „Serie ab diesem Termin beenden“, bei `late`: „Doch nicht berechnen“.
- **„Zeiten bearbeiten“:** Raster von 05:00–22:00 in 30-Min-Zellen. Tippen oder Ziehen gibt frei bzw. blockiert (erste Zelle bestimmt die Richtung). Vergangene Zellen gesperrt. Tipp auf Tageskopf → „Ganzen Tag blockieren“ / „Auf Standardzeiten zurücksetzen“. Angepasste Tage sind markiert. Speichern nach jedem Loslassen.
- **„+ Termin eintragen“:** Familie, Datum, Dauer, Beginn (nur freie Zeiten) → nutzt `book_lessons` mit `p_family_id`.
- Karte „Apple Kalender“ mit Abo-Link (siehe 11) und Knopf „Link neu erzeugen“.

**Standardzeiten**
- Dasselbe Mal-Raster für die normale Woche (ohne Datum). Tipp auf Wochentag → „Keine Zeiten an diesem Tag“.
- Einstellung „Kostenlos absagen bis: 12 / 24 / 48 Stunden vorher“.

**Schüler & Preise**
- **Aktuell (Phase 6):** kompakte Tabelle (Farbpunkt, Name, @username/E-Mail, Status-Tag, Preise 1/1,5/2 Std., Offen); Tipp auf Zeile → Bearbeiten-Dialog mit „Save“ und unten Einladung/Sperren/Löschen.
- Karte pro Familie: Schülername, Eltern, E-Mail, Preise 60/90/120 (HK$), Statistik „X Std. gehalten · HK$ Y offen“.
- „+ Schüler anlegen“ → Einladung per E-Mail. „Einladung erneut senden“. „Deaktivieren“ (Login gesperrt, Daten bleiben). Löschen nur ohne Buchungen.
- Hinweis: Neue Preise gelten nur für neue Buchungen.

**Zahlungen**
- Monatsauswahl, Filter nach Schüler.
- Summenkarten: „Fällig und noch offen“ (vergangene + `late`, unbezahlt), „Bezahlt“, „Noch geplant“. Darunter „Offen: Mia HK$ 420 · Jonas HK$ 280“.
- Tabelle: Datum/Zeit (+ Markierung „geplant“ / „kurzfr. abgesagt“), Schüler, Dauer, Betrag, Status-Knopf Offen ↔ Bezahlt.
- **„Für Google Sheet kopieren“:** tab-getrennte Zeilen in die Zwischenablage (`Datum | Schüler | Beginn | Dauer (Std.) | Betrag (HKD) | Status`), direkt in Google Sheets einfügbar.
- (Entfernt auf Wunsch von Mats: „Alle Daten exportieren“.)

---

## 11. Apple Kalender

- Link: `webcal://<projekt>.supabase.co/functions/v1/calendar-feed?token=<ics_token>` (in der Admin-Ansicht mit „Kopieren“-Knopf und Kurzanleitung).
- Mats abonniert ihn einmalig: iPhone → Einstellungen → Kalender → Accounts → Account hinzufügen → Andere → Kalenderabo hinzufügen. Mac → Kalender → Ablage → Neues Kalenderabonnement (dort Aktualisierung „Alle 5 Minuten“/„Jede Stunde“ wählbar).
- Hinweis an Mats: Apple aktualisiert abonnierte Kalender nicht sofort. Für Sofort-Infos gibt es die E-Mails.
- „Link neu erzeugen“ erstellt einen neuen Token (alter Link funktioniert dann nicht mehr).

---

## 12. E-Mails

Versand über Gmail-SMTP (App-Passwort; Voraussetzung: Zwei-Faktor-Anmeldung im Google-Konto). Absendername „Nachhilfe Mats“. **Alle E-Mail-Texte auf Englisch** (Wunsch von Mats, Phase 3), kurz, mit Datum, Uhrzeit, Dauer, Betrag in HK$ und Link zur App. Uhrzeiten für die Familie in `profiles.timezone`, für Mats in `settings.timezone`, jeweils mit Zeitzonen-Hinweis, z. B. „15:00 (Hong Kong time)“.

**Auth-Mail-Links:** Einladungs- und Reset-Mails verlinken auf `{{ .SiteURL }}?token_hash={{ .TokenHash }}&type=invite|recovery#/set-password`; die App ruft damit `verifyOtp` auf. Grund: Der Standard-Link von Supabase legt Tokens in den `#`-Teil der Adresse und kollidiert mit dem HashRouter. Eigene Vorlagen erfordern eigenes SMTP (ist eingerichtet).

| Anlass | An Familie | An Mats |
|---|---|---|
| Einzeltermin gebucht | „Your lesson is booked: Mon, 5 Oct, 15:00–16:30“ | „New booking: Mia Berger, …“ |
| Serie gebucht | Übersicht aller Termine + übersprungene Wochen | dito, kurz |
| Termin abgesagt (von Familie oder Mats) | Bestätigung der Absage | Info |
| Serie beendet | Übersicht der abgesagten Termine | Info |
| Einladung | Eigene Vorlage `supabase/templates/invite.html` (englisch) | – |
| Passwort vergessen | Eigene Vorlage `supabase/templates/recovery.html` (englisch) | – |
| Monatlicher Zahlungsbericht (1. des Monats, Vormonat) | – | CSV `Name, Betrag, Datum, Status` (Datum TT/MM/JJJJ, „Bezahlt“/„Nicht bezahlt“) |

**E-Mail-Einstellungen (Phase 11):** Jedes Konto hat `profiles.notify_bookings`, `notify_cancellations` (Familien und Mats) und `notify_report` (nur Mats, Monatsbericht); änderbar nur über RPC `set_email_prefs` (eigene Zeile). Familien: Menü „Emails“; Mats: Settings → „Emails to you“. `send-notification` und `monthly-report` halten sich daran. Einladungs-/Passwort-Mails gehen immer raus.

**Supabase Auth muss ebenfalls über Gmail senden:** In Supabase unter Authentication → Emails → SMTP Settings eigenes SMTP eintragen (Gmail). Der eingebaute Supabase-Mailversand ist nur für Tests gedacht und stark begrenzt.

---

## 13. Bauplan in Phasen

Jede Phase: umsetzen → committen/pushen → Mats testet anhand der Checkliste → erst dann weiter.

**Phase 0 – Vorbereitung (mit Mats)**
- Konten: GitHub, Supabase, Google-App-Passwort für Gmail. Claude Code gibt Klick-Anleitungen.
- Offene Punkte klären: Zeitzone bestätigen, Name/Anzeige „Mats“, Repository-Name.
- Tools prüfen/installieren: Node.js, Git, GitHub CLI (`gh`), Supabase CLI.
- ✅ Mats kann sich bei allen Diensten anmelden; lokale Tools laufen.

**Phase 1 – Grundgerüst & Veröffentlichung**
- Vite + React + TS, CSS-Grundlagen aus dem Prototyp, HashRouter, Platzhalter-Seiten.
- Öffentliches GitHub-Repo, `deploy.yml` (Build + `actions/deploy-pages`), GitHub Pages aktivieren.
- ✅ `https://<user>.github.io/<repo>/` zeigt eine Startseite im Design.

**Phase 2 – Datenbank**
- Migrationen für alle Tabellen, Constraints, Trigger (`ends_at`), RLS, `is_admin()`, Einstellungen-Zeile mit zufälligem `ics_token`.
- Supabase-Auth: Registrierung aus, Weiterleitungs-URLs auf die GitHub-Pages-Adresse.
- Mats' Admin-Konto anlegen und Rolle setzen.
- ✅ Tabellen sichtbar im Supabase-Dashboard; RLS ist bei allen aktiv.

**Phase 3 – Login & Rollen-Weiche**
- Login, Abmelden, Passwort festlegen, Passwort vergessen; Weiterleitung nach Rolle.
- ✅ Mats loggt sich ein und landet in `#/admin`.

**Phase 4 – Schüler & Preise, Einladungen**
- Tab „Schüler & Preise“, Edge Function `invite-family`, Gmail-SMTP in Supabase Auth.
- ✅ Mats lädt eine Test-Familie (eigene zweite E-Mail-Adresse) ein; sie setzt ein Passwort und landet in `#/book`. Die Test-Familie kann `#/admin` nicht nutzen.

**Phase 5 – Zeiten**
- Tab „Standardzeiten“ (Mal-Raster + Absagefrist), Kalender-Modus „Zeiten bearbeiten“ mit Tagesanpassungen.
- ✅ Zeiten ändern sich sichtbar und bleiben nach Neuladen erhalten.

**Phase 6 – Buchen (Familie)**
- `get_free_starts`, `book_lessons`, `cancel_booking`, `end_series`; komplette Schüleransicht.
- ✅ Test-Familie bucht einzeln und als Serie, sagt ab; innerhalb der Frist ist Absagen gesperrt. Zwei Browser gleichzeitig können nicht dieselbe Zeit buchen.

**Phase 7 – Admin-Kalender**
- Wochen-/Monatsansicht, Termin-Details, Bezahlt-Schalter, Absagen/`late`, „+ Termin eintragen“, Wochensumme.
- ✅ Buchungen der Test-Familie erscheinen sofort bei Mats.

**Phase 8 – Zahlungen**
- Tab „Zahlungen“ inkl. TSV-Kopie und Export.
- ✅ Eingefügte Zeilen landen korrekt in Spalten in Google Sheets.

**Phase 9 – E-Mails**
- Outbox-Einträge in den RPC-Funktionen, Database Webhook, `send-notification` mit Gmail (Port 465).
- ✅ Bei Buchung/Absage erhalten Familie und Mats je eine E-Mail; Serie = eine E-Mail.

**Phase 10 – Apple Kalender**
- `calendar-feed`, Karte mit Link, „Link neu erzeugen“.
- ✅ Mats abonniert den Link auf dem iPhone; Termine erscheinen; abgesagte verschwinden nach Aktualisierung.

**Phase 11 – Betrieb & Absicherung**
- `keepalive.yml`: alle 3 Tage eine leichte Anfrage an Supabase (verhindert das Pausieren des Free Plans nach 7 Tagen Inaktivität).
- `monthly-report.yml`: am 1. jedes Monats `monthly-report` aufrufen. **Berichte niemals ins Repository committen oder als öffentliches Artefakt ablegen.**
- Kurze Datenschutz-Seite (welche Daten, wofür, Kontakt, Löschung auf Anfrage) und Link im Fußbereich. Mats klären lassen, welches Datenschutzrecht für ihn gilt.
- Fehlerzustände prüfen (kein Internet, Zeit gerade vergeben, Sitzung abgelaufen), Handy-Test auf iPhone Safari.
- ✅ Actions laufen grün; Monatsbericht kommt an.

**Phase 12 – Echtbetrieb**
- Testdaten löschen, echte Familien anlegen und einladen, kurze Anleitung für Familien (3 Sätze + Link) als Textvorlage für Mats.

---

**Stand (Oktober 2026):** Phasen 0–12 umgesetzt. Testdaten gelöscht; in der Datenbank sind nur Mats' Admin-Konto, `settings` (inkl. Kalender-Token) und seine E-Mail-Einstellungen. Mats trägt Standardzeiten und echte Familien selbst ein. `supabase db advisors`: nur gewollte Hinweise (RPCs als `security definer`, prüfen den Aufrufer selbst) und „leaked password protection“ (nur im Pro-Plan).

## 14. Später (bewusst nicht jetzt bauen)

- Automatische Synchronisation mit Google Sheets (aktuell: Kopieren-Knopf)
- Erinnerungs-E-Mail am Vortag
- WhatsApp-Knöpfe mit vorformuliertem Text
- Eigene Domain
- Online-Bezahlung

---

## 15. Kurzglossar für Mats

- **Repository (Repo):** der Projektordner auf GitHub.
- **Commit / Push:** Änderungen speichern / auf GitHub hochladen – danach wird die Seite automatisch neu veröffentlicht.
- **Supabase:** die Datenbank im Hintergrund, die sich alle Buchungen und Logins merkt.
- **RLS (Row Level Security):** Regeln in der Datenbank, die festlegen, wer welche Daten sehen darf.
- **Edge Function:** kleines Programm auf dem Server, z. B. zum E-Mail-Versenden.
- **Secret:** geheimer Schlüssel, der nie öffentlich sein darf.
