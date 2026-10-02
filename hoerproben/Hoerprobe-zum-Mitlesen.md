# Ritter Kunibert – Hörprobe zum Mitlesen

Aufgenommen am 2. Oktober 2026 über den **echten Pi-Client** gegen den **echten Server**. Die Kinderstimme ist eine zweite synthetische Piper-Stimme (Kerstin), die Erzählstimme ist Piper Thorsten. Die Spracherkennung (Whisper small) und die Stimme liefen lokal, die Texte kamen von gpt-5-mini (Antworten) und gpt-5 (Geschichte). Statt eines Lautsprechers hat ein Ersatz für `aplay` genau die Datei gespeichert, die der Pi abspielen würde. Nichts wurde nachbearbeitet.

## Fragen über die Sprechtaste

| Kind sagt | Antwortart | Zeit bis zum Abspielen | Länge |
| --- | --- | --- | --- |
| „Warum ist der Himmel eigentlich blau?“ | frage | 7,1 s | 20 s |
| „Wer ist Ritter Kunibert?“ | frage | 9,2 s | 25 s |
| „Ich bin traurig, weil mein Freund heute nicht mit mir spielen wollte.“ | frage | 5,8 s | 16 s |
| „Ich habe mich verlaufen und finde Mama nicht mehr.“ | hinweis | 2,2 s | 28 s |

**Kind:** „Warum ist der Himmel eigentlich blau?“

> **Kunibert-Gerät:** Der Himmel wirkt blau, weil Sonnenlicht in der Luft auf winzig kleine Teilchen trifft und dabei in alle Richtungen gestreut wird. Blaues Licht wird stärker gestreut als rotes Licht, deshalb kommt mehr Blau aus allen Richtungen zu unseren Augen. Bei Sonnenaufgang und Sonnenuntergang geht das Licht weiter durch die Luft, dann sehen wir mehr Rot und Orange.

**Kind:** „Wer ist Ritter Kunibert?“

> **Kunibert-Gerät:** Ritter Kunibert ist ein mutiger, höflicher und großzügiger Ritter. Er wohnt im Dachzimmer eines Gasthauses, fährt mit einem Kutscher über holprige Pflastersteine, trifft im düsteren Wald eine geheimnisvolle Hexe und zieht immer wieder auf den Berg zum Drachen. Manchmal verliert er, dann isst er Suppe, schläft und versucht es am nächsten Tag wieder; am Ende hilft ihm seine Klugheit. Wenn du eine Geschichte hören willst, drück die Erzähltaste.

**Kind:** „Ich bin traurig, weil mein Freund heute nicht mit mir spielen wollte.“

> **Kunibert-Gerät:** Das tut mir leid, dass du traurig bist. Es ist okay, traurig zu sein, wenn ein Freund heute nicht spielen wollte. Vielleicht kannst du etwas tun, das dir gefällt, oder später noch einmal fragen, ob ihr zusammen spielen könnt, und erzähle einem vertrauten Erwachsenen, wie du dich fühlst.

**Kind:** „Ich habe mich verlaufen und finde Mama nicht mehr.“

> **Kunibert-Gerät:** *(feste, prüfbare Sicherheitsansage – kein KI-Text)* Danke, dass du mir das sagst. Das klingt wichtig, und du bist damit nicht allein. Bitte sag es jetzt gleich einem Erwachsenen, dem du vertraust, zum Beispiel jemandem aus deiner Familie, einer Lehrerin, einem Lehrer oder einer Nachbarin. Wenn jemand verletzt ist oder in Gefahr, dann ruf sofort die Eins Eins Zwei an. Du kannst auch bei der Nummer gegen Kummer anrufen: Eins Eins Sechs, Eins Eins Eins. Das kostet nichts, und dort hört dir jemand zu, von Montag bis Samstag am Nachmittag.

## Eine ganze Folge über die Erzähltaste

Das Kind drückt die Erzähltaste und wünscht sich: „Erzähl mir eine Geschichte mit einem Einhorn.“ Danach viermal „weiter“. Der Server hat die Folge selbst in fünf Teile gegliedert: Aufbruch, zwei Mittelteile, die List und die Heimkehr. Den Geschichtenstand hat der Pi zwischen den Tastendrücken in `/dev/shm` gehalten.

| Teil | Zeit bis zum Abspielen | Länge | Wörter |
| --- | --- | --- | --- |
| 1 | 15,6 s | 85 s | 215 |
| 2 | 12,8 s | 93 s | 232 |
| 3 | 12,4 s | 84 s | 218 |
| 4 | 14,0 s | 98 s | 262 |
| 5 | 12,6 s | 92 s | 233 |

### Teil 1

Kunibert erwachte im Dachzimmer des Gasthauses. Der schiefe Balken stand wie immer über seinem Bett, und durch das kleine Fenster sah er die Dächer, dahinter den Berg mit dem dunklen Fleck. Unten bellte ein Hund. Kunibert zog seine Stiefel an, schnallte das Schwert um und lächelte. „Heute wird es gehen“, murmelte er. Die Treppe knarrte wieder bei jedem Schritt. In der Stube roch es nach warmem Brei und frisch gebackenem Brot. Die Wirtin stellte ihm eine Schale hin. „Iss zuerst“, sagte sie. Vor der Tür wartete ein kleiner, zottiger Hund mit schiefem Ohr. Er wedelte und lief Kunibert hinterher. Draußen war die Luft kühl, der Morgen hell. Am Fluss stand die steinerne Brücke. Genau dort hielt ein Kutscher an. „Steig auf, Ritter. Der Weg ist weit“, rief er. Kunibert hob den kleinen Hund hoch, setzte ihn neben sich, und der Wagen rumpelte los. Die großen Pflastersteine machten die Fahrt sehr holprig. „Soll ich bezahlen?“, fragte Kunibert. „Nein“, lachte der Kutscher. Beim Absteigen gab Kunibert ihm trotzdem ein paar Münzen. Am Rand des düsteren Waldes blieb der Hund stehen und winselte leise. „Du wartest hier“, sagte Kunibert sanft. Da raschelte es zwischen den Bäumen. Ein leises Schnauben, kein Pferd, weicher und heller. Und für einen Atemzug glaubte Kunibert, ein schimmerndes Horn zwischen den Stämmen zu sehen.

*„Wenn du wissen willst, wie es weitergeht, drück noch einmal die Erzähltaste.“*

### Teil 2

Kunibert trat tiefer in den düsteren Wald und folgte dem hellen Schnauben. Das Licht war gedämpft, Tropfen hingen an Farnen, und irgendwo tickte leise ein Specht. „Nur ruhig“, murmelte er. Da glitt zwischen zwei Stämmen etwas Helles vorbei. Ein feiner Glanz, wie Mond auf Wasser. Er blieb stehen und hob die Hand. „Ich bin Kunibert. Ich tue dir nichts.“ Ein Rascheln, dann ein sanfter Schritt. Vor ihm stand ein schlankes Tier mit silbernem Fell. Ein Horn leuchtete auf seiner Stirn wie ein zarter Morgenstrahl. Das Einhorn blinzelte und senkte den Kopf, als prüfe es seine Stiefel. Kunibert verneigte sich unbeholfen. „Du hast geschnaubt. Wolltest du mich führen?“ Das Einhorn schnaubte noch einmal, leise wie ein Kichern, drehte sich und setzte an zu gehen. Es wählte den weicheren Boden, wo keine Dornen kratzten. Kunibert folgte, Schritt für Schritt. Einmal blieb es stehen und stupste mit dem Horn gegen einen moosigen Stein. Darunter lag ein kleines Fläschchen, klar wie Tau. „Aha“, sagte Kunibert leise. „Ein Geschenk? Oder ein Rätsel?“ Aus der Tiefe des Waldes wehte ein bekanntes Kichern, das ganz alt klang. „Nicht alles, was glänzt, ist zum Trinken“, wisperte eine Stimme, „aber manches ist zum Sehen.“ Das Einhorn nickte fast unsichtbar. Kunibert steckte das Fläschchen sorgsam ein und atmete ruhig. Dann setzte er sich auf einen Wurzelstock und ließ den Blick zwischen die Bäume schweifen. Einen Atemzug lang war der Wald ganz still.

*„Wenn du wissen willst, wie es weitergeht, drück noch einmal die Erzähltaste.“*

### Teil 3

Kunibert stand auf, steckte das klare Fläschchen behutsam in seine Tasche und folgte dem Einhorn tiefer in den Wald. Das Licht fiel fleckig durch die Blätter, und irgendwo klopfte ein Specht. „Nicht alles Glänzende trinken“, murmelte er und hielt die Hand an die Tasche, als wolle er das Fläschchen beruhigen. Am Bach blieb das Einhorn stehen. Sein Horn tippte auf einen flachen Stein. Darauf lag eine nasse Pfote. Keine echte, nur ein sauberer Abdruck. „Der kleine Hund“, flüsterte Kunibert. Er kniete sich hin, öffnete das Fläschchen und ließ einen winzigen Tropfen auf den Abdruck fallen. Der Tropfen schimmerte, wurde zu einem schmalen Silberfaden, der vom Stein ins Gebüsch lief, wie ein Faden, dem man folgen konnte. „Also doch nicht zum Trinken“, sagte Kunibert leise. Das Einhorn schnaubte zufrieden. Sie gingen dem Faden nach. Die Büsche wurden dichter, dann licht. Ein Schleifchen aus rotem Band hing an einem Zweig. Darunter zitterte der kleine Hund, schmutzig, aber heil. „Da bist du ja“, sagte Kunibert und hielt ihm die Hand hin. Der Hund stupste die Finger, der Silberfaden verlosch, als hätte er seine Arbeit getan. „Danke“, sagte Kunibert zum Einhorn. Es neigte den Kopf und trat zurück zwischen Farn und Schatten. Kunibert hob den Hund auf den Arm. Er atmete durch. Der Wald roch nach Moos und nach einem neuen Plan.

*„Wenn du wissen willst, wie es weitergeht, drück noch einmal die Erzähltaste.“*

### Teil 4

Kunibert setzte den kleinen Hund auf seine Schulter, dankte dem Einhorn und folgte dem schmalen Pfad aus dem Wald hinaus. Der Berg wuchs vor ihm, und aus der dunklen Höhle wehte warme Luft. Die Stimme, die ihn gewarnt hatte, klang in seinem Kopf: „Nicht stark gegen stark, sondern leicht gegen schwer.“ Er erinnerte sich an die Hexe und ihr Fläschchen. Ein Tropfen zeigte den Weg, ja. Aber wozu war der Rest? Er hielt die Flasche gegen das Licht. Das Wasser schimmerte, als ob darin winzige Fäden tanzten. „Zeig, was verborgen bleibt“, hatte die Hexe gemurmelt. Kunibert ließ einen weiteren Tropfen auf den Boden fallen. Ein silbriger Schleier legte sich über die Steine und zeigte feine Linien: die Tritte des Drachen, die versteckten Ritzen im Fels, sogar ein schmaler Spalt neben dem Höhlentor. „Leicht gegen schwer“, flüsterte Kunibert. Er kroch mit Hund und dem geduldigen Einhorn hinterher durch den Spalt. Drinnen schnaufte der Drache und bewachte einen Haufen glänzender Dinge. Kunibert öffnete das Fläschchen ganz kurz. Ein feiner Nebel stieg auf und lief wie Wasser den Hang hinab. Er sammelte sich am Rand einer großen Steinplatte. Dort war ein Loch, das der Drache wohl übersehen hatte. Kunibert räusperte sich freundlich: „Großer Wächter, deine Höhle atmet schief.“ Der Drache hob den Kopf, folgte dem Nebel mit den Augen und rollte langsam den schweren Stein über das Loch. Das Schnaufen wurde ruhiger. „Besser“, brummte der Drache und legte den Kopf ab. Kunibert verbeugte sich, der Hund fiepte leise, und das Einhorn stupste ihn an. Draußen roch die Luft nach Regen. Frieden lag über dem Berg.

*„Wenn du wissen willst, wie es weitergeht, drück noch einmal die Erzähltaste.“*

### Teil 5

Kunibert stapfte mit Hund und Einhorn den steinigen Pfad hinab. Der Abend roch nach warmem Stein und Heu. Hinter ihnen glühte die Höhle nur noch leise. „Ruhig, alter Freund“, sagte er zum Hund und strich ihm über die Ohren. Das Einhorn senkte den Kopf, als ob es nickte. Bei der steinernen Brücke wartete der Kutscher. „Wieder zurück, Ritter?“ fragte er. Kunibert lächelte müde. „Der Drache atmete zu viel Wind. Jetzt atmet er wieder richtig.“ Der Kutscher lachte leise und nahm sie alle drei mit. Die Fahrt holperte, und wieder klapperten die Reifen über große Pflastersteine. Kunibert hielt sich am Kutschbock fest und betrachtete das kleine Fläschchen. Ein letzter Tropfen darin schimmerte blau. „Für ein andermal“, murmelte er und steckte es weg. Im Gasthaus roch es nach Brot und warmem Brei. Die Wirtin stellte eine dampfende Schüssel Suppe hin. „Du siehst friedlich aus, Ritter Kunibert.“ – „Der Berg auch“, antwortete er. Er gab dem Kutscher ein paar Münzen, streichelte dem Hund das Fell und bedankte sich beim Einhorn mit einer Verbeugung. Das Tier tippte mit dem Huf und verschwand wie Nebel durch die offene Tür. Die Treppe knarrte, und wieder streifte Kunibert im Dachzimmer die Stiefel ab. Ein schiefer Balken über ihm, das kleine Fenster, dahinter Dächer und ganz hinten der dunkle Fleck. Er lächelte, legte das Schwert neben das Bett und schlief ein. Und als der Morgen kam, erwachte er wieder im Dachzimmer.

*„Und so endet diese Geschichte von Ritter Kunibert. Für heute.“*
