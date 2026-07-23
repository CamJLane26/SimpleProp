import {
  CallbackPositionProperty,
  CallbackProperty,
  Cartesian3,
  Color,
  Ellipsoid,
  JulianDate,
  Matrix3,
  Quaternion,
  ReferenceFrame,
  type PositionProperty,
  type Property,
} from "cesium";

/** Maximum half-angle off nadir for LEO sensor field of regard. */
export const FOR_HALF_ANGLE_RAD = (30 * Math.PI) / 180;

type PositionHolder = {
  current: PositionProperty | undefined;
};

const scratchFixed = new Cartesian3();
const scratchSurface = new Cartesian3();
const scratchAxis = new Cartesian3();
const scratchCenter = new Cartesian3();
const scratchX = new Cartesian3();
const scratchY = new Cartesian3();
const scratchRotation = new Matrix3();

function satFixedAt(
  holder: PositionHolder,
  time: JulianDate,
): Cartesian3 | undefined {
  const property = holder.current;
  if (!property) return undefined;
  // PositionProperty.getValue() already resolves into FIXED coordinates.
  // Request the frame explicitly so the cone and satellite share the exact
  // same position and avoid rotating an already-fixed value a second time.
  return property.getValueInReferenceFrame(
    time,
    ReferenceFrame.FIXED,
    scratchFixed,
  );
}

function coneLengthAndAxis(
  satFixed: Cartesian3,
): { length: number; axis: Cartesian3; surface: Cartesian3 } | undefined {
  const surface = Ellipsoid.WGS84.scaleToGeodeticSurface(
    satFixed,
    scratchSurface,
  );
  if (!surface) return undefined;

  Cartesian3.subtract(satFixed, surface, scratchAxis);
  const length = Cartesian3.magnitude(scratchAxis);
  if (!(length > 50)) return undefined;
  Cartesian3.divideByScalar(scratchAxis, length, scratchAxis);
  return { length, axis: scratchAxis, surface };
}

function quaternionZenithZ(
  outwardAxis: Cartesian3,
  result: Quaternion,
): Quaternion {
  // Cesium cylinders use local +Z as the "top" end (topRadius).
  // Point +Z radially outward so topRadius=0 (apex) sits at the satellite
  // when the entity is centered halfway down toward Earth.
  if (Math.abs(outwardAxis.z) < 0.9) {
    Cartesian3.cross(Cartesian3.UNIT_Z, outwardAxis, scratchX);
  } else {
    Cartesian3.cross(Cartesian3.UNIT_X, outwardAxis, scratchX);
  }
  Cartesian3.normalize(scratchX, scratchX);
  Cartesian3.cross(outwardAxis, scratchX, scratchY);
  Cartesian3.normalize(scratchY, scratchY);

  Matrix3.setColumn(scratchRotation, 0, scratchX, scratchRotation);
  Matrix3.setColumn(scratchRotation, 1, scratchY, scratchRotation);
  Matrix3.setColumn(scratchRotation, 2, outwardAxis, scratchRotation);
  return Quaternion.fromRotationMatrix(scratchRotation, result);
}

/**
 * Mutable holder so resampled orbit properties keep driving the same FOR cone.
 */
export function createPositionHolder(
  initial?: PositionProperty,
): PositionHolder {
  return { current: initial };
}

export type ForConeGraphics = {
  position: CallbackPositionProperty;
  orientation: Property;
  length: Property;
  bottomRadius: Property;
};

/**
 * Build time-dynamic cone graphics: apex at the satellite, axis along nadir,
 * half-angle {@link FOR_HALF_ANGLE_RAD} (30°). Length is the exact distance
 * from the satellite to its WGS84 ellipsoid intercept.
 *
 * Cesium places topRadius at local +Z and bottomRadius at local -Z, centered
 * on the entity position. We orient +Z outward and shift the center toward
 * Earth by half the cone length so the apex coincides with the satellite.
 */
export function createForConeGraphics(
  holder: PositionHolder,
): ForConeGraphics {
  const position = new CallbackPositionProperty(
    (time, result) => {
      if (!time) return undefined;
      const satFixed = satFixedAt(holder, time);
      if (!satFixed) return undefined;
      const geometry = coneLengthAndAxis(satFixed);
      if (!geometry) return undefined;

      // The cylinder is centered between the exact satellite and ellipsoid
      // intercept, making its local +Z endpoint exactly equal to satFixed.
      Cartesian3.midpoint(satFixed, geometry.surface, scratchCenter);
      return Cartesian3.clone(scratchCenter, result);
    },
    false,
    ReferenceFrame.FIXED,
  );

  const orientation = new CallbackProperty((time, result) => {
    if (!time) return undefined;
    const satFixed = satFixedAt(holder, time);
    if (!satFixed) return undefined;
    const geometry = coneLengthAndAxis(satFixed);
    if (!geometry) return undefined;
    return quaternionZenithZ(
      geometry.axis,
      result instanceof Quaternion ? result : new Quaternion(),
    );
  }, false);

  const length = new CallbackProperty((time) => {
    if (!time) return undefined;
    const satFixed = satFixedAt(holder, time);
    if (!satFixed) return undefined;
    return coneLengthAndAxis(satFixed)?.length;
  }, false);

  const bottomRadius = new CallbackProperty((time) => {
    if (!time) return undefined;
    const satFixed = satFixedAt(holder, time);
    if (!satFixed) return undefined;
    const length = coneLengthAndAxis(satFixed)?.length;
    if (length === undefined) return undefined;
    return length * Math.tan(FOR_HALF_ANGLE_RAD);
  }, false);

  return { position, orientation, length, bottomRadius };
}

export function forConeColor(isIss: boolean): Color {
  return isIss
    ? Color.fromCssColorString("#fbbf24").withAlpha(0.22)
    : Color.fromCssColorString("#38bdf8").withAlpha(0.18);
}

export function forConeOutlineColor(isIss: boolean): Color {
  return isIss
    ? Color.fromCssColorString("#fbbf24").withAlpha(0.7)
    : Color.fromCssColorString("#7dd3fc").withAlpha(0.55);
}
