import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  bodySettled,
  physicalBodyKind,
} from "../games/make-a-mess/src/game/destructionRuntime.ts";

/**
 * «ТЕЛО ОСЕЛО» — ВОПРОС, НА КОТОРЫЙ ОБЯЗАН БЫТЬ ОДИН ОТВЕТ.
 *
 * Его задают двое: рендер (писать ли матрицу куска) и вытеснение при
 * переполнении (кого выбросить первым). Пока ответ писался на месте, он
 * разошёлся: осевший обломок переводится в `Fixed`, `isSleeping()` у
 * нефизического тела возвращает false, и проверку заменили на «не Dynamic».
 *
 * Под это правило попала КИНЕМАТИКА — а ею живёт всё, что движется без
 * решателя: лопасти и подвижные члены машин, створки дверей и ворот,
 * постоянные роторы. Рендер перестал писать им матрицы, и МАШИНА ВЗЛЕТАЛА
 * БЕЗ ВИНТОВ: тела ехали с ней, а меши оставались там, где их написали в
 * последний раз — в точке спавна или где придётся.
 */

const RAPIER_TYPES = { Dynamic: 0, Fixed: 1, KinematicPositionBased: 2, KinematicVelocityBased: 3 };

test("кинематическое тело не оседает НИКОГДА", () => {
  // Главное утверждение файла. Кинематику двигают снаружи, и решатель о её
  // движении не знает по построению: спросить у него «шевелится ли» нельзя,
  // поэтому единственный безопасный ответ — «шевелится».
  assert.equal(bodySettled("kinematic", false), false);
  assert.equal(
    bodySettled("kinematic", true),
    false,
    "даже «уснувшая» кинематика обязана рисоваться: сон ей ставит не движение",
  );
});

test("замороженный обломок осел, динамический — только уснув", () => {
  assert.equal(bodySettled("fixed", false), true, "у Fixed степеней свободы нет");
  assert.equal(bodySettled("fixed", true), true);
  assert.equal(bodySettled("dynamic", true), true);
  assert.equal(bodySettled("dynamic", false), false);
});

test("тип тела переводится одинаково, и оба кинематических — одно", () => {
  assert.equal(physicalBodyKind(RAPIER_TYPES.Dynamic, RAPIER_TYPES), "dynamic");
  assert.equal(physicalBodyKind(RAPIER_TYPES.Fixed, RAPIER_TYPES), "fixed");
  assert.equal(
    physicalBodyKind(RAPIER_TYPES.KinematicPositionBased, RAPIER_TYPES),
    "kinematic",
  );
  assert.equal(
    physicalBodyKind(RAPIER_TYPES.KinematicVelocityBased, RAPIER_TYPES),
    "kinematic",
    "второй кинематический тип для этого вопроса неразличим с первым",
  );
});

test("оба потребителя спрашивают ОБЩИЙ предикат, а не тип тела", () => {
  // Сторож против повторения: ошибка стоила винтов ровно потому, что предикат
  // был написан дважды и по-своему.
  //
  // Проверяется НЕ отсутствие сравнения с `Dynamic` вообще — это законная
  // идиома в десятке мест («тело симулируется?», «будить ли перед резкой»), и
  // запрещать её значило бы завести сторожа, который врёт о своём предмете.
  // Проверяется, что на вопрос «ОСЕЛО ЛИ» отвечает общая функция.
  const sites = [
    [
      "../games/make-a-mess/src/game/DynamicBreakableWorld.tsx",
      /sleeping = bodySettled\(/,
    ],
    [
      "../games/make-a-mess/src/game/MakeAMessGame.tsx",
      /const settled =\s*!body \|\|\s*bodySettled\(/,
    ],
  ];
  for (const [relative, expected] of sites) {
    const path = fileURLToPath(new URL(relative, import.meta.url));
    // Переводы строк нормализуются: на Windows файл лежит с CRLF, и сравнение
    // многострочного образца иначе падает не по делу.
    const source = readFileSync(path, "utf8").replaceAll("\r\n", "\n");
    assert.match(
      source,
      expected,
      `${relative}: покой считается на месте, а не общим предикатом`,
    );
  }
});
