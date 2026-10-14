# NovaPlay IPTV — player per Smart TV Samsung e Hisense

App IPTV per **Samsung (Tizen)** e **Hisense (VIDAA)**, utilizzabile anche da **chiavetta USB** e dal browser.
Interfaccia che unisce lo stile di **Netflix, Prime Video, YouTube e Apple TV**, pensata per il telecomando.

## Funzioni

| Sezione | Cosa fa |
|---|---|
| **Home** | Sfondo dinamico in stile Apple TV / Prime e righe in stile Netflix: *Continua a guardare*, canali preferiti e recenti, film e serie aggiunti di recente, categorie |
| **Live TV** | Categorie, lista canali con programma in onda e barra di avanzamento, **anteprima video** (1° OK) e schermo intero (2° OK), guida TV del canale, preferiti (tasto blu), cambio canale con ▲▼ / CH+ CH− / tasti numerici |
| **Film** | Categorie, griglia locandine, scheda con trama, cast, regia, voto e durata, **riprendi da dove eri rimasto** |
| **Serie TV** | Stagioni ed episodi, *Continua SxEy*, **episodio successivo automatico** |
| **Cerca** | Ricerca in canali, film e serie con tastiera a schermo (o tastiera del TV) |
| **Impostazioni** | Playlist multiple, account e scadenza, player, sottotitoli e audio, guida TV, temi, proxy |
| **Header** | **Data del giorno e ora** sempre visibili, **scadenza del pacchetto** con i giorni rimanenti (verde, arancione sotto i 7 giorni, rosso se scaduto) |

### Sorgenti supportate
- **Xtream Codes** (server, utente, password): canali, film, serie, EPG e scadenza letti dal server.
- **Link M3U / M3U8**: se il link è in stile Xtream (`get.php?username=…&password=…`) l'app ricava da sola **scadenza, schede dei film ed EPG**. In tutti gli altri casi la scadenza si può inserire a mano (gg/mm/aaaa).
- **File M3U da chiavetta USB** e **file di configurazione `novaplay.json`** (vedi sotto).

### Player stabile
- **Samsung**: usa il decoder nativo **AVPlay**, il più stabile per i flussi TS/HLS.
- **Hisense / browser**: `<video>` HTML5 con **hls.js** (HLS) e **mpegts.js** (MPEG-TS live), già inclusi, quindi funziona anche offline.
- **Watchdog anti-blocco**: se l'immagine si ferma per più di 12 s (live) o 20 s (film), il flusso si riavvia da solo. In caso di errore riprova fino a 8 volte con attese crescenti, e i film ripartono dal punto in cui erano.
- **Buffer** regolabile, formato live **TS o HLS**, motore selezionabile (Auto / AVPlay / HTML5).
- Sospende e riprende la riproduzione quando cambi app sul TV.

### Sottotitoli, audio e EPG
- **Sottotitoli**: scelta della traccia (tasto **rosso** o pulsante *Sottotitoli*), attivazione automatica nella lingua preferita, tre dimensioni.
- **Tracce audio**: tasto **verde**, con la lingua preferita selezionata in automatico.
- **Formato immagine**: tasto **giallo** (Originale / Adatta / Zoom).
- **EPG**: per Xtream la guida si scarica per ogni canale, solo per i canali visibili, quindi è veloce. Per le liste M3U usa l'XMLTV indicato da `url-tvg` / `x-tvg-url` oppure un URL personalizzato (anche `.xml.gz`). C'è una correzione dell'orario da −12 a +12 ore.

### Telecomando
| Tasto | Azione |
|---|---|
| Frecce / OK | Navigazione |
| Indietro | Torna indietro, nasconde i comandi ed esce dallo schermo intero |
| ▲▼, CH+ CH−, 0-9 | Cambio canale (in riproduzione live) |
| ◀▶, ⏪ ⏩ | Indietro/avanti nei film (tieni premuto per accelerare) |
| ⏯ | Play/Pausa |
| Rosso / Verde / Giallo / Blu | Sottotitoli / Audio / Formato / Preferito |
| CH+ CH− nelle liste | Pagina su/giù |

Su PC si possono usare frecce, Invio, Esc, `r` `g` `y` `b`, `i` e la barra spaziatrice.

---

## Struttura del progetto

```
app/                     l'applicazione (HTML/CSS/JS, nessuna dipendenza da installare)
  index.html, config.xml (Tizen), icon.png
  css/app.css
  js/  util, m3u, xtream, catalog, epg, nav, ui, usb, player, app
  js/screens/  home, live, vod (film/serie + scheda), search, settings
  js/vendor/   hls.js 1.6.15, mpegts.js 1.8.0 (licenze incluse)
tools/
  build.js               crea dist/NovaPlay.wgt, dist/usb/ e dist/NovaPlay-USB.zip
  serve.js               server locale + proxy CORS (per Hisense / browser)
  make-icon.js           rigenera l'icona
  novaplay.example.json  esempio di configurazione da USB
```

Il codice è ES5 puro, compatibile con i TV meno recenti (Tizen 3+ / Chromium 47+, VIDAA).

```bash
node tools/build.js          # crea i pacchetti in dist/
node tools/serve.js 8080     # prova l'app su http://localhost:8080
```

---

## Installazione su Samsung (Tizen, modelli dal 2017 in poi)

Samsung installa solo app **firmate**, quindi la prima installazione si fa in rete in *modalità sviluppatore* (una volta sola).

1. **Attiva la modalità sviluppatore sul TV**: apri *App*, digita `1 2 3 4 5` con il telecomando, attiva **Developer mode**, inserisci l'**IP del PC** e riavvia il TV.
2. Sul PC installa **Tizen Studio** con l'estensione **Samsung TV Extension** (dal Package Manager).
3. In *Tools > Certificate Manager* crea un **certificato Samsung** (serve un account Samsung). Nel certificato distributore aggiungi il **DUID del TV**, che trovi collegando il TV dal *Device Manager*.
4. Crea e firma il pacchetto:
   ```bash
   TIZEN_PROFILE=nome_del_tuo_profilo node tools/build.js
   ```
   Senza la CLI `tizen` il file `dist/NovaPlay.wgt` resta **non firmato**: puoi importare la cartella `app/` in Tizen Studio e usare *Run As > Tizen Web Application*.
5. Installa sul TV:
   ```bash
   sdb connect IP_DEL_TV
   tizen install -n dist/NovaPlay.wgt -t NOME_DISPOSITIVO   # nome da "sdb devices"
   ```
6. L'app compare tra le App del TV come **NovaPlay IPTV**.

**USB su Samsung**: una volta installata, l'app legge dalla chiavetta USB i file `.m3u`/`.m3u8` e la configurazione `novaplay.json`, da *Impostazioni > Playlist > Carica da chiavetta USB*. I TV Samsung non permettono di **installare** app non firmate direttamente da USB: per questo serve il passaggio iniziale sopra.

## Uso su Hisense (VIDAA)

VIDAA non permette di installare app di terze parti. L'app però è una pagina web autonoma e si può aprire così:

- **Dal PC di casa (consigliato)**: sul PC esegui `node tools/serve.js` e sul TV apri il **browser** all'indirizzo che compare (es. `http://192.168.1.10:8080`). Se i canali non si caricano per errori CORS, in *Impostazioni > Rete e proxy* imposta `http://192.168.1.10:8080/proxy`.
- **Da chiavetta USB**: estrai `dist/NovaPlay-USB.zip` sulla chiavetta e apri `NovaPlay/index.html` con il browser del TV, se il tuo modello consente di aprire file locali. Dipende dal modello e dalla versione del firmware VIDAA.
- **Da un NAS o server web**: copia la cartella `dist/usb/NovaPlay/` e apri l'indirizzo dal browser del TV.

Su Hisense il player usato è HTML5 (hls.js / mpegts.js). Se un canale non parte, prova *Formato canali live: HLS (.m3u8)* nelle impostazioni Player.

> Nota: se la pagina è servita in **https**, i flussi **http** vengono bloccati dal browser. Per questo conviene usare `http://`, come fa `serve.js`.

---

## Configurazione da chiavetta USB (`novaplay.json`)

Copia `tools/novaplay.example.json` sulla chiavetta come `novaplay.json`, inserisci i tuoi dati e importalo da *Carica da chiavetta USB*. Lo stesso pulsante è nella schermata di benvenuto.

```json
{
  "playlists": [
    { "type": "xtream", "name": "La mia IPTV", "server": "http://server:8080", "user": "utente", "pass": "password" },
    { "type": "m3u", "name": "Lista", "url": "http://…/lista.m3u", "epgUrl": "http://…/epg.xml.gz", "expiry": "31/12/2026" }
  ],
  "settings": { "theme": "netflix", "subAuto": true, "subLang": "ita" }
}
```

Temi disponibili: `prime`, `netflix`, `youtube`, `apple`.

---

Usa l'app solo con liste e abbonamenti IPTV di cui hai legalmente i diritti.
