# Candidate B media-support spike

Inventory of movie files under `D:\tmp\media\gif material`, evaluated against the current Candidate B implementation (Mediabunny demuxing + WebCodecs decoding + CanvasSink rendering).

Generated: 2026-08-11
Probe: `ffprobe version 2021-06-16-git-604924a069-full_build-www.gyan.dev Copyright (c) 2007-2021 the FFmpeg developers`

## Executive result

- Movie files found recursively: **413**
- Files that will not work in the current Candidate B path: **169**
- Files that pass the structural container/codec screen: **244**

The failure list is grouped by the first blocking reason. A file is listed once. Relative paths below are relative to the media root.

## Why these files fail

### 1. AVI container is not supported by Mediabunny `ALL_FORMATS`

Count: **162**

Candidate B constructs `Input` with Mediabunny `ALL_FORMATS`. The vendored format list includes MP4/ISOBMFF, QuickTime, Matroska/WebM, and other formats, but not AVI. These files therefore fail before frame decoding.

- `Born to Win [BorntoWin].avi`
- `Charly (1968) WS DVDRip XviD-pong.avi`
- `Daisy Miller (Peter Bogdanovich, 1974)\Daisy Miller (Peter Bogdanovich, 1974).avi`
- `Funny girl (1968) DVDRip\Funny Girl (1968).DVDRip.avi`
- `Hitchcock Films (1925-34)\1925 - The Pleasure Garden.avi`
- `Hitchcock Films (1925-34)\1927 - Downhill.avi`
- `Hitchcock Films (1925-34)\1927 - The Lodger.avi`
- `Hitchcock Films (1925-34)\1927 - The Ring.AVI`
- `Hitchcock Films (1925-34)\1928 - Easy Virtue.avi`
- `Hitchcock Films (1925-34)\1928 - The Farmer's Wife.avi`
- `Hitchcock Films (1925-34)\1929 - Blackmail.avi`
- `Hitchcock Films (1925-34)\1929 - The Manxman.avi`
- `Hitchcock Films (1925-34)\1930 - Juno and the Paycock.avi`
- `Hitchcock Films (1925-34)\1930 - Murder.avi`
- `Hitchcock Films (1925-34)\1931 - Rich and Strange - East of Shanghai (USA).avi`
- `Hitchcock Films (1925-34)\1931 - The Skin Game.avi`
- `Hitchcock Films (1925-34)\1932 - Number Seventeen.avi`
- `Hitchcock Films (1925-34)\1933 - Waltzes From Vienna.avi`
- `Hitchcock Films (1925-34)\1934 - The Man Who Knew Too Much.avi`
- `Hitchcock Films (1935-44)\1935 - The 39 Steps.avi`
- `Hitchcock Films (1935-44)\1936 - Sabotage.avi`
- `Hitchcock Films (1935-44)\1936 - Secret Agent.AVI`
- `Hitchcock Films (1935-44)\1937 - Young & Innocent.avi`
- `Hitchcock Films (1935-44)\1938 - The Lady Vanishes.avi`
- `Hitchcock Films (1935-44)\1939 - Jamaica Inn.avi`
- `Hitchcock Films (1935-44)\1940 - Foreign Correspondent.avi`
- `Hitchcock Films (1935-44)\1940 - Rebecca.avi`
- `Hitchcock Films (1935-44)\1941 - Mr. & Mrs. Smith.avi`
- `Hitchcock Films (1935-44)\1941 - Suspicion (Colorized).avi`
- `Hitchcock Films (1935-44)\1941 - Suspicion.avi`
- `Hitchcock Films (1935-44)\1942 - Saboteur.avi`
- `Hitchcock Films (1935-44)\1943 - Shadow of a Doubt .avi`
- `Hitchcock Films (1935-44)\1944 - Bon Voyage & Madagascar Landing.avi`
- `Hitchcock Films (1935-44)\1944 - Lifeboat.avi`
- `Hitchcock Films (1945-54)\1945 - Spellbound.avi`
- `Hitchcock Films (1945-54)\1946 - Notorious.avi`
- `Hitchcock Films (1945-54)\1947 - The Paradine Case.avi`
- `Hitchcock Films (1945-54)\1948 - Rope.avi`
- `Hitchcock Films (1945-54)\1949 - Under Capricorn.avi`
- `Hitchcock Films (1945-54)\1950 - Stage Fright.avi`
- `Hitchcock Films (1945-54)\1951 - Strangers on a Train.avi`
- `Hitchcock Films (1945-54)\1953 - I Confess.avi`
- `Hitchcock Films (1945-54)\1954 - Dial M For Murder.avi`
- `Hitchcock Films (1945-54)\1954 - Rear Window.avi`
- `Hitchcock Films (1955-76)\1955 - The Trouble with Harry.avi`
- `Hitchcock Films (1955-76)\1955 - To Catch a Thief.avi`
- `Hitchcock Films (1955-76)\1956 - The Man Who Knew Too Much.avi`
- `Hitchcock Films (1955-76)\1956 - The Wrong Man.avi`
- `Hitchcock Films (1955-76)\1958 - Vertigo.avi`
- `Hitchcock Films (1955-76)\1959 - North by Northwest.avi`
- `Hitchcock Films (1955-76)\1960 - Psycho.avi`
- `Hitchcock Films (1955-76)\1963 - The Birds.avi`
- `Hitchcock Films (1955-76)\1964 - Marnie.avi`
- `Hitchcock Films (1955-76)\1966 - Torn Curtain.avi`
- `Hitchcock Films (1955-76)\1969 - Topaz.avi`
- `Hitchcock Films (1955-76)\1972 - Frenzy.avi`
- `Hitchcock Films (1955-76)\1976 - Family Plot.avi`
- `Il Posto (Ermanno Olmi, 1961) Criterion DVDRip\Il Posto (Ermanno Olmi, 1961).avi`
- `Los Angeles Plays Itself (2003)Thom Andersen\Los Angeles Plays Itself (2003)Thom Andersen1.avi`
- `Los Angeles Plays Itself (2003)Thom Andersen\Los Angeles Plays Itself (2003)Thom Andersen2.avi`
- `Love Me Tonight (1932) Xvid 1cd - Jeanette MacDonald, Maurice Chevalier Comedy Musical [DDR]\Hollywood on Parade - Jeannette MacDonald.avi`
- `Love Me Tonight (1932) Xvid 1cd - Jeanette MacDonald, Maurice Chevalier Comedy Musical [DDR]\Hollywood on Parade - Maurice Chevalier.avi`
- `Love Me Tonight (1932) Xvid 1cd - Jeanette MacDonald, Maurice Chevalier Comedy Musical [DDR]\Love Me Tonight (1932) Xvid 1cd - Jeanette MacDonald, Maurice Chevalier Comedy Musical [DDR].avi`
- `Love Me Tonight (1932) Xvid 1cd - Jeanette MacDonald, Maurice Chevalier Comedy Musical [DDR]\Trailer - Love Me Tonight.avi`
- `Peter Brook - Meetings with remarkable men\Peter Brook - Meetings with remarkable men.avi`
- `Rocky Deluxe DVD Boxset - The Complete Collection Part I, II, III, IV, V & VI + Extras (Alternate ending etc) DVDRip\Rocky I\Rocky I (1976).avi`
- `Rocky Deluxe DVD Boxset - The Complete Collection Part I, II, III, IV, V & VI + Extras (Alternate ending etc) DVDRip\Rocky II\Rocky II (1979).avi`
- `Rocky Deluxe DVD Boxset - The Complete Collection Part I, II, III, IV, V & VI + Extras (Alternate ending etc) DVDRip\Rocky III\Rocky III (1982).avi`
- `Rocky Deluxe DVD Boxset - The Complete Collection Part I, II, III, IV, V & VI + Extras (Alternate ending etc) DVDRip\Rocky IV\Rocky IV (1985).avi`
- `Rocky Deluxe DVD Boxset - The Complete Collection Part I, II, III, IV, V & VI + Extras (Alternate ending etc) DVDRip\Rocky V\Rocky V (1990).avi`
- `Rocky Deluxe DVD Boxset - The Complete Collection Part I, II, III, IV, V & VI + Extras (Alternate ending etc) DVDRip\Rocky VI\Rocky VI Balboa (2006).avi`
- `Room at the Top (1959) Simone Signoret\Room at the Top (1959) Simone Signoret.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1975] All Men Are Brothers\All Men are Brothers.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1975] Bloody Escape, The\the.bloody.escape.1975.dvdrip.xvid-yyddr.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1975] Disciples Of Shaolin\Disciples Of Shaolin 1975 Dvdrip Xvid-Wrd.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1975] Lady of the Law\[SB]Lady.Of.The.Law.1975.DVDRip.XviD-SBunite.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1975] Marco Polo\Marco Polo (1975).avi`
- `Shaw Bros Martial Arts [1975-1979]\[1975] Protectors, The\The.Protectors.1975.DVDRIP.XviD-CG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1975] Spiritual Boxer, The\The.Spiritual.Boxer.1975.DVDRip.XviD.CG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1975] Super Inframan\Super Inframan -CG-.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1976] Big Bad Sis\Big Bad Sis -CG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1976] Boxer Rebellion\Boxer Rebellion -CG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1976] Challenge of the Masters\challenge.of.the.masters.dvdrip.xvid.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1976] Clans of Intrigue\Clans.of.Intrigue.1977.DVDRIP.XviD-CG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1976] Dragon Missile, The\the.dragon.missile.dvdrip.xvid.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1976] Killer Clans\Killer Clans.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1976] Magic Blade, The\Magic.Blade.1976.DVDRIP.XViD-CG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1976] New Shaolin Boxers\New Shaolin Boxers -CG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1976] Sexy Killer\The Sexy Killer - SB (1976).avi`
- `Shaw Bros Martial Arts [1975-1979]\[1976] Shaolin Avengers, The\The Shaolin Avengers -CG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1976] Shaolin Temple\Shaolin Temple -CG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1976] Web of Death, The\lemon998-twod.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1977] Battle Wizard, The\[SB]The.Battle.Wizard.1977.DVDRip.XviD-SBunite.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1977] Brave Archer, The\The Brave Archer -CG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1977] Chinatown Kid\Chinatown Kid -CG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1977] Death Duel\Death Duel -CG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1977] Executioners From Shaolin\Executioners From Shaolin -CG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1977] Flying Guillotine 2\sbunite.tfg2.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1977] Jade Tiger, The\The Jade Tiger -CG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1977] Judgement Of An Assassin\Judgement Of An Assassin.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1977] Magnificent Wanderers\Magnificent Wanderers -CG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1977] Pursuit of Vengeance\Pursuit.Of.Vengeance.1977.DVDrip.Xvid-SBunite.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1977] Sentimental Swordsman, The\The.Sentimental.Swordsman.1977.DVDRIP.XViD-CG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1977] Soul of the Sword\Soul Of The Sword.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1977] Vengeful Beauty, The\The Vengeful Beauty -CG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1978] 36th Chamber Of Shaolin, The\Extras\Film.Critic.Interview.2007.DVDRip.XviD-KG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1978] 36th Chamber Of Shaolin, The\Extras\Gordon.Liu.Interview.2007.DVDRip.XviD-KG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1978] 36th Chamber Of Shaolin, The\Extras\Shaolin.-.A.Hero.Birthplace.2003.DVDRip.XviD-KG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1978] 36th Chamber Of Shaolin, The\Extras\The.RZA.Interview.2007.DVDRip.XviD-KG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1978] 36th Chamber Of Shaolin, The\Extras\Trailers\Disciples.Of.The.36th.Chamber.Trailer.DVDRip.XviD-KG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1978] 36th Chamber Of Shaolin, The\Extras\Trailers\Eight.Diagram.Pole.Fighter.Trailer.DVDRip.XviD-KG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1978] 36th Chamber Of Shaolin, The\Extras\Trailers\My.Young.Auntie.Trailer.DVDRip.XviD-KG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1978] 36th Chamber Of Shaolin, The\Extras\Trailers\One.Armed.Swordsman.Trailer.DVDRip.XviD-KG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1978] 36th Chamber Of Shaolin, The\Extras\Trailers\Return.To.The.36th.Chamber.Trailer.DVDRip.XviD-KG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1978] 36th Chamber Of Shaolin, The\Extras\Trailers\Shaolin.Mantis.Trailer.DVDRip.XviD-KG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1978] 36th Chamber Of Shaolin, The\Extras\Trailers\Theatratical.Trailer.1978.DVDRip.XviD-KG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1978] 36th Chamber Of Shaolin, The\The.36th.Chamber.Of.Shaolin.1978.DVDRip.TripleAudio.XviD-KG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1978] Avenging Eagle, The\the.avenging.eagle.1978.dvdrip.xvid-retro.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1978] Brave Archer 2, The\The Brave Archer 2 -CG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1978] Clan of Amazons\Clan.of.Amazons.1978.DVDRIP.XViD-CG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1978] Crippled Avengers\1978.Crippled.Avengers.XviD.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1978] Five Superfighters\Five.Superfighters.1978.DVDRip.XviD-WRD.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1978] Five Venoms, The\the.five.venoms.1978.dvdrip.xvid.ac3.6ch-[gx].avi`
- `Shaw Bros Martial Arts [1975-1979]\[1978] Heaven Sword And Dragon Sabre\Heaven Sword and Dragon Sabre.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1978] Heaven Sword Dragon Sabre 2\[SB]Heaven.Sword.Dragon.Sabre.2.1978.DVDRip.XviD-SBunite.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1978] Heroes Shed No Tears\Heroes Shed No Tears -CG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1978] Invincible Shaolin\[SB]Invincible.Shaolin.1977.DVDRip.XviD-SBunite.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1978] Legend of the Bat\Legend of the Bat -CG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1978] Life Gamble\Life.Gamble.1979.DVDrip.XviD-SBunite.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1978] Proud Youth, The\The.Proud.Youth.1978.DVDRip.XviD-NDRT.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1978] Shaolin Hand Lock\Shaolin.Hand.Lock.1978.DVDRip.XviD-EDRP.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1978] Shaolin Mantis\gid-sham.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1978] Swordsman and Enchantress\Swordsman.And.Enchantress.1978.DVDRip.XviD-DVD-R.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1979] Brothers, The\yyddr-tb.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1979] Daredevils, The\THE DAREDEVILS.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1979] Deadly Breaking Sword, The\The Deadly Breaking Sword -CG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1979] Dirty Ho\Dirty.Ho.1979.DVDRip.AC3.XviD-SG-CG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1979] Fighting Fool, The\The.Fighting.Fool.1980.DVDrip.Xvid-SBunite.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1979] Full Moon Scimitar\Full.Moon.Scimitar.1979.DVDRip.XviD-WRD.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1979] Heroes Of The East\heroes.of.the.east.1978.dvdrip.xvid.ac3.6ch-[gx].avi`
- `Shaw Bros Martial Arts [1975-1979]\[1979] Kid With Golden Arm, The\The Kid With The Golden Arm.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1979] Kung Fu Instructor, The\[SB]The.Kung.Fu.Instructor.1979.DVDRip.XviD-SBunite.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1979] Mad Monkey Kung Fu\Mad monkey kung fu.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1979] Magnificent Ruffians, The\The.Magnificent.Ruffians.1979.DVDrip.Xvid-SBunite.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1979] Monkey Kung Fu\Monkey Kung Fu -CG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1979] Murder Plot\Murder.Plot.1979.DVDrip.Xvid-SBunite.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1979] Proud Twins, The\The Proud Twins -CG.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1979] Shadow Boxing, The\[SB]The.Shadow.Boxing.1979.DVDRip.XviD-SBunite.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1979] Shaolin Abbot\Shaolin.Abbot.1979.DVDrip.Xvid-SBunite.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1979] Shaolin Rescuers\Shaolin.Rescuers.1979.DVDrip.Xvid-SBunite.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1979] Ten Tigers of Kwangtung\Ten.Tigers.Of.Kwang.Tung.1979.DVDrip.Xvid-YYddr.avi`
- `Shaw Bros Martial Arts [1975-1979]\[1979] Tigress of Shaolin, The\The.Tigress.Of.Shaolin.1979.DVDRip.XviD-SBunite.avi`
- `Tadare(1962)Yasuzo.Masumura\Tadare(1962)Yasuzo.Masumura.avi`
- `The Cloud-Capped Star\Meghe.Dhaka.Tara.1400MV.DivX.avi`
- `The Innocents.1961.BRRip.XviD-VLiS\The Innocents.1961.BRRip.XviD-VLiS.avi`
- `The Killing.1956.CRITERION.BRRip.XviD-VLiS\The Killing.1956.CRITERION.BRRip.XviD-VLiS.avi`
- `The Prince of Tides.1991.DVDRip.XviD.AC3[5.1].AR\The Prince of Tides.1991.DVDRip.XviD.AC3[5.1].AR.avi`
- `The.Big.Chill.1983.WS.DVDRip.XViD.iNT-EwDp\ewdp-bigchill.xvid.avi`
- `The.Glass.Key.1942.BRRip.XviD.MP3-XVID\The.Glass.Key.1942.BRRip.XviD.MP3-XVID.avi`
- `Two for the Road (1967) Audrey Hepburn Eng\Two for the Road (1967) Audrey Hepburn Eng.avi`
- `Unstoppable[2010]DvDrip[Eng]-FXG\Unstoppable[2010]DvDrip[Eng]-FXG.avi`
- `Witness For The Prosecution (1957) Tyrone Power,Marlene Dietrich\Witness For The Prosecution (1957) Tyrone Power,Marlene Dietrich.avi`

### 2. FLV container is not supported by Mediabunny `ALL_FORMATS`

Count: **3**

The three FLV files contain H.264 video, but the container itself is outside the current Mediabunny input-format set. H.264 in this case does not compensate for the unsupported container.

- `Rocky Deluxe DVD Boxset - The Complete Collection Part I, II, III, IV, V & VI + Extras (Alternate ending etc) DVDRip\Extras\Rocky Balboa Alternative ending.FLV`
- `Rocky Deluxe DVD Boxset - The Complete Collection Part I, II, III, IV, V & VI + Extras (Alternate ending etc) DVDRip\Extras\Rocky Balboa Deleted Scene.FLV`
- `Rocky Deluxe DVD Boxset - The Complete Collection Part I, II, III, IV, V & VI + Extras (Alternate ending etc) DVDRip\Extras\Rocky Balboa Outtakes.FLV`

### 3a. Motion JPEG video codec (`mjpeg`) is outside Candidate B's WebCodecs video codec path

Count: **1**

The container is otherwise supported, but the current Candidate B uses the browser WebCodecs decoder through Mediabunny. Its supported video codec family is AVC/H.264, HEVC/H.265, VP8, VP9, and AV1; it has no custom MPEG-4 Part 2 or Motion JPEG decoder extension.

- `The.Servant.1963.Criterion.1080p.BluRay.x265.HEVC.FLAC-SARTRE\Extras\Joseph Losey On The Servant.mkv` (matroska,webm; Baseline; yuvj422p)

### 3b. MPEG-4 Part 2 video codec (`mpeg4`) is outside Candidate B's WebCodecs video codec path

Count: **2**

The container is otherwise supported, but the current Candidate B uses the browser WebCodecs decoder through Mediabunny. Its supported video codec family is AVC/H.264, HEVC/H.265, VP8, VP9, and AV1; it has no custom MPEG-4 Part 2 or Motion JPEG decoder extension.

- `Hitchcock Films (1925-34)\1928 - Champagne.mp4` (mov,mp4,m4a,3gp,3g2,mj2; Simple Profile; yuv420p)
- `Les Amis 1971.mkv` (matroska,webm; Advanced Simple Profile; yuv420p)

### 4. Unreadable or not actually a movie stream

Count: **1**

These files cannot provide a primary video track to Candidate B. They should be treated as bad/incomplete media rather than as a codec-coverage gap.

- `L.Eclisse.1962.(M.Antonioni).1080p.BRRip.x264-Classics\Sample.mkv` (ffprobe failed; malformed or unreadable input)

## Runtime-dependent cases

The structural pass is not a promise that every file decodes on every Electron machine. WebCodecs support is configuration- and hardware-dependent. Candidate B now calls Mediabunny's track-level `canDecode()` (which delegates to `VideoDecoder.isConfigSupported`) before constructing `CanvasSink` and reports a candidate-local error when it returns false. The shared frame-index path performs the same early check because frame indexing itself requires a decodable video track.

- **46** structurally compatible files use HEVC Main 10 (`yuv420p10le`). These are intentionally not classified as hard failures, but they are the most important runtime validation group for the target Electron build.
- H.264/AVC profile, level, resolution, and hardware decoder limits can also change the result for an individual machine.
- Candidate B currently has no audio preview path. Audio codecs therefore do not determine this frame-scrubbing list; later FFmpeg extraction can handle the audio paired with a selected video range independently.

## Compatibility evidence

- Candidate B implementation: [`src/candidates/mediabunny/mediabunny-control.ts`](../src/candidates/mediabunny/mediabunny-control.ts)
- Frame-index construction: [`src/indexing/movie-frame-index.ts`](../src/indexing/movie-frame-index.ts)
- Vendored `ALL_FORMATS`: [`candidates-source-code/mediabunny/src/input-format.ts`](../candidates-source-code/mediabunny/src/input-format.ts)
- Mediabunny codec/container matrix: [`supported-formats-and-codecs.md`](../candidates-source-code/mediabunny/docs/guide/supported-formats-and-codecs.md)

## Interpretation

This is a static media-support screen using `ffprobe` metadata and the current Candidate B dependency/source tree. It identifies hard incompatibilities before attempting a full interactive load of every movie. The runtime-dependent section is deliberately separate: those files require an Electron/WebCodecs probe on the target hardware before support can be promised.

