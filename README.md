# GTA by Claude

Przeglądarkowa gra 3D w stylu mini-GTA: miasto z dzielnicami, ruchem ulicznym, autostradą i estakadą, cyklem dnia i nocy, bronią i kradzieżą aut. Działa w przeglądarce, bez instalacji i bez serwera. Cała oprawa (tekstury, modele, dźwięk) jest generowana proceduralnie w JavaScripcie, bez zewnętrznych plików graficznych i dźwiękowych.

![Miasto z lotu ptaka](screenshots/miasto-z-gory.jpg)

| Rondo | Estakada | Węzeł autostradowy |
|---|---|---|
| ![Rondo](screenshots/rondo.jpg) | ![Estakada](screenshots/estakada.jpg) | ![Węzeł](screenshots/wezel.jpg) |

## Uruchomienie

1. Pobierz repozytorium (`Code → Download ZIP` albo `git clone`).
2. Otwórz plik `index.html` w Chrome, Firefox, Edge lub Safari (dwuklik wystarczy).
3. Kliknij **WEJDŹ DO MIASTA**.

Potrzebne jest połączenie z internetem, bo Three.js i cannon.js ładują się z CDN (cdnjs). Gra nie wymaga serwera. Jeśli wolisz serwer lokalny: `npx serve` albo `python3 -m http.server` w katalogu projektu.

## Sterowanie

Sterowanie można zmienić w menu (przycisk **STEROWANIE** albo `Esc`).

| Klawisz | Akcja |
|---|---|
| `W` `A` `S` `D` (w aucie także strzałki) | ruch pieszo, jazda autem |
| Mysz | kamera (kliknij w ekran, żeby przechwycić kursor; `Esc` zwalnia) |
| `Shift` | bieg |
| `Spacja` | skok pieszo, hamulec ręczny (drift) w aucie |
| `F` lub `E` | wsiądź, wysiądź, ukradnij auto NPC |
| `H` | klakson |
| `1` `2` `3` / `Q` | wybór broni / koło broni |
| Lewy przycisk myszy | atak, strzał |
| `R` | przeładuj (pieszo) albo postaw auto na kołach |
| `T` | przyspiesz upływ doby (przytrzymaj) |
| `M` | wycisz dźwięk |
| `` ` `` | menu debug |

Menu debug pozwala m.in. zmieniać liczbę aut i pieszych, ustawić i zatrzymać godzinę, włączyć nieśmiertelność, teleportować się i zmienić mnożnik prędkości auta.

## Co jest w grze

- **Miasto** 12×12 kwartałów z dzielnicami (centrum z wieżowcami, handlowa, przemysłowa, mieszkalna), placami, parkami, parkingami i przystankami.
- **Ruch uliczny**: auta NPC jeżdżą prawostronnie, stają na czerwonym świetle, zatrzymują się przy znakach STOP, stosują regułę prawej ręki, jadą z różnymi prędkościami i zwalniają za wolniejszym autem.
- **Ronda** z krążącymi autami, znakami C-12 i A-7 oraz ustępowaniem pierwszeństwa.
- **Autostrada** dwujezdniowa z wyprzedzaniem lewym pasem, węzłem (zjazd i wjazd), estakadą, drogą pod nią i tunelami na końcach.
- **Gracz**: tryb pieszy i jazda autem z fizyką zawieszenia (RaycastVehicle), kradzież aut NPC, ekwipunek (pięści, kij, pistolet), pasek zdrowia i kondycji.
- **Świat**: cykl dnia i nocy ze zmianą nieba, mgły i oświetlenia, minimapa całego świata, piesi na chodnikach, dźwięk syntezowany (Web Audio).

## Struktura projektu

```
index.html        strona, style i HUD
loadorder.txt     kolejność ładowania skryptów (ważna!)
js/               kod gry (23 pliki ładowane kolejno z index.html)
test/             testy: harness, symulacja ruchu, jazda autem, skrypt bundle
```

Skrypty to zwykłe pliki (bez bundlera) ze wspólnym zakresem globalnym, więc ich kolejność ma znaczenie. Po dodaniu pliku zaktualizuj `loadorder.txt` i tagi `<script>` w `index.html`.

## Testy

```
npm install          # instaluje cannon@0.6.2 potrzebny testowi jazdy
npm test             # harness + symulacja ruchu NPC
npm run test:drive   # jazda prawdziwym autem po autostradzie i łącznicach (ok. 2 min)
npm run bundle       # skleja grę w jeden plik gta-by-claude-single.html
```

## Plany i ograniczenia

- Ronda są małe, a miejskie auta NPC mijają je prosto.
- Wnętrze miasta to nadal siatka ortogonalna, bez nieregularnych ulic.
- Auta miejskie nie wjeżdżają na autostradę.
- Limity prędkości z znaków nie są egzekwowane, brakuje znaków zakazu wjazdu i nakazu kierunku.
- Piesi nie korzystają jeszcze z przejść dla pieszych.

## Technologie

Three.js r128, cannon.js 0.6.2, Web Audio API, Canvas 2D. Czysty JavaScript, bez frameworków.
