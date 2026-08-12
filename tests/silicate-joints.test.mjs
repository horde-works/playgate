import assert from "node:assert/strict";
import test from "node:test";
import {
  SILICATE_JOINT,
  SILICATE_JOINT_EXPANSION,
  hasSilicateJoints,
  silicateJointBand,
  silicateJointTint,
} from "../games/make-a-mess/src/game/silicateJoints.ts";

test("шов принадлежит всей кладке крепости, а не одной башне", () => {
  // Кладка: башня, надвратные башни, куртина, плечи причала. Раньше связующее
  // доставалось только тёмной башне, и в остальных стенах те же авторские швы
  // в 30 мм стояли открытыми — 453 сквозные и тёмные щели на одних надвратных.
  assert.equal(hasSilicateJoints("stronghold:dark-tower:wall:x:12", "graphiteStone"), true);
  assert.equal(hasSilicateJoints("stronghold:gatehouse:tower:0:face:-1:1:0", "basalt"), true);
  assert.equal(hasSilicateJoints("stronghold:wall:course:0:3", "graphiteStone"), true);
  assert.equal(hasSilicateJoints("stronghold:berth:shoulder:-1:0:0", "basalt"), true);
});

test("порода, стекло и настил связующего не получают", () => {
  // Хребты и осыпь — не кладка, у них швов нет.
  assert.equal(hasSilicateJoints("stronghold:ridge:east:rock:2:1", "basalt"), false);
  assert.equal(hasSilicateJoints("stronghold:mountain-scree:rock:7", "basalt"), false);
  // Стекло: панель, нарисованная на 5 см шире, полезла бы в откосы. Поэтому
  // остекление обязано заполнять ячейку курса ТОЧНО — см. wall:x/:z и бойницы.
  assert.equal(hasSilicateJoints("stronghold:dark-tower:signal:0", "darkGlass"), false);
  assert.equal(hasSilicateJoints("stronghold:gatehouse:tower:0:face:1:6:1", "darkGlass"), false);
  // НАСТИЛ МОСТИТСЯ ВСТЫК. Пол, кровля и палуба швов не имеют: закрывать
  // нечего, а расширение выносит две копланарные грани на поверхность, по
  // которой ходят. Полы тёмной башни так дали 254 спорных стыка.
  assert.equal(hasSilicateJoints("stronghold:dark-tower:floor:2:1:1", "basalt"), false);
  assert.equal(hasSilicateJoints("stronghold:dark-tower:roof:1:2", "basalt"), false);
  assert.equal(hasSilicateJoints("stronghold:berth:deck:-1:front", "basalt"), false);
});

test("связующее шире шва — иначе кладка светится насквозь", () => {
  // ИНВАРИАНТ. Обгонит шов связующее — и он открывается на всю длину блока.
  // Так и было у кроны тёмной башни: шов 55 мм при связующем 52 мм оставлял
  // щель в 3 мм высотой в блок и длиной 7.5 м. Запас нужен ощутимый: блоки
  // ставятся и по кривой, где шов местами шире номинала.
  assert.equal(SILICATE_JOINT_EXPANSION > SILICATE_JOINT, true);
  assert.equal(SILICATE_JOINT_EXPANSION - SILICATE_JOINT > 0.015, true);
});

test("полоса шва сужается на крупном блоке, чтобы не съесть камень", () => {
  assert.equal(silicateJointBand([1.42, 0.72, 0.72]) > 0.008, true);
  assert.equal(silicateJointBand([1.545, 1.05, 7.5]) < 0.004, true);
});

test("связующее держится цвета своего блока", () => {
  assert.equal(silicateJointTint("#303437"), "#262b2f");
  assert.equal(silicateJointTint("#45494c"), "#2d3236");
});
