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
- **Ruch uliczny**: auta NPC jeżdżą prawostronnie, stają na czerwonym (sygnalizatory trzykomorowe z fazą żółtą), zatrzymują się na STOP, ustępują wg reguły prawej ręki, a przy alei z pierwszeństwem — autom na niej. Konflikty na skrzyżowaniach rozstrzygają wg czasu dojazdu, więc auta się nie przenikają.
- **Przepisy i znaki**: limity są egzekwowane (miasto 50 km/h, strefa 30 w Starym Mieście, droga serwisowa 40, autostrada 140, a przy węźle i tunelach 100). Jednokierunkowa obwodnica przy murze, aleja z pierwszeństwem, ponad 900 znaków (A-7, B-2, B-20, B-33, B-43/B-44, C-2, C-6, C-9, C-12, D-1, D-3, D-6, D-42/D-43) na słupkach, które nie przebijają tarcz.
- **Ronda** o jednolitych parametrach: wyspa z opaską (R 4,5 m), pas okrężny 4,5 m, wloty i wyloty łukami z wysepkami rozdzielającymi, linie P-13. Auta NPC objeżdżają wyspę przeciwnie do ruchu wskazówek zegara i ustępują jadącym po rondzie.
- **Piesi** spacerują po chodnikach i przechodzą przez jezdnię po przejściach (na światłach w swojej fazie), a auta im ustępują.
- **Autostrada** dwujezdniowa z wyprzedzaniem lewym pasem, węzłem, estakadą, drogą pod nią, tunelami z oświetleniem i latarniami. Część aut miejskich wjeżdża na nią i zjeżdża łącznicami. W strefie wschodniej jeździ ruch po drodze serwisowej z zawrotkami.
- **Gracz**: tryb pieszy i jazda autem z fizyką zawieszenia (RaycastVehicle), kradzież aut NPC, ekwipunek (pięści, kij, pistolet), pasek zdrowia i kondycji.
- **Świat**: cykl dnia i nocy (słońce, księżyc, mgła, latarnie z plamami światła na jezdni), minimapa całego świata, dźwięk syntezowany (Web Audio).

## Struktura projektu

```
index.html        strona, style i HUD
loadorder.txt     kolejność ładowania skryptów (ważna!)
js/               kod gry (25 plików ładowanych kolejno z index.html)
test/             testy: harness, symulacja ruchu, jazda autem, skrypt bundle
```

Skrypty to zwykłe pliki (bez bundlera) ze wspólnym zakresem globalnym, więc ich kolejność ma znaczenie. Po dodaniu pliku zaktualizuj `loadorder.txt` i tagi `<script>` w `index.html`.

## Testy

```
npm install          # instaluje cannon@0.6.2 potrzebny testowi jazdy
npm test             # harness + symulacja ruchu NPC (nakładanie aut, zakleszczenia, ronda, piesi, przepisy)
npm run test:drive   # jazda prawdziwym autem: autostrada, łącznice, rondo, kolizje (ok. 3 min)
npm run bundle       # skleja grę w jeden plik gta-by-claude-single.html
```

## Plany i ograniczenia

- Wnętrze miasta to nadal siatka ortogonalna, bez nieregularnych ulic (trasy NPC to stałe pętle, nie graf).
- Węzeł autostradowy jest jednopoziomowy (jedna estakada), łącznice są tylko po stronie jezdni A.
- Auta autostradowe nie dają się ukraść, a w tunelu auta „zawijają się” na drugi koniec.
- AI NPC działa w całym mieście naraz (bez ograniczania obliczeń daleko od gracza i bez LOD).
- Auta NPC nie omijają przeszkody na pasie (np. zaparkowanego auta gracza), tylko przed nią czekają.

## Technologie

Three.js r128, cannon.js 0.6.2, Web Audio API, Canvas 2D. Czysty JavaScript, bez frameworków.
