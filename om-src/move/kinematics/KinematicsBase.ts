import ModelObject from "../../ModelObject";

export enum KinematicsName {
    cartesian = "cartesian",
    coreXY = "coreXY",
    coreXYU = "coreXYU",
    coreXYUV = "coreXYUV",
    coreXZ = "coreXZ",
    markForged = "markForged",
    fiveBarScara = "fiveBarScara",
    hangprinter = "hangprinter",
    linearDelta = "linearDelta",
    polar = "polar",
    rotaryDelta = "rotaryDelta",
    scara = "scara",
    unknown = "unknown"
}

export class MoveSegmentation extends ModelObject {
    segmentsPerSec: number = 0;
    minSegmentLength: number = 0;
}

export abstract class KinematicsBase extends ModelObject {
    readonly name: KinematicsName;
    readonly segmentation: MoveSegmentation = new MoveSegmentation();

    constructor(name: KinematicsName) {
        super();
        this.name = name;
    }
}

export default KinematicsBase

export class TiltCorrection extends ModelObject {
    correctionFactor: number = 0;
    lastCorrections: Array<number> = [];
    maxCorrection: number = 0;
    screwPitch: number = 0;
    screwX: Array<number> = [];
    screwY: Array<number> = [];
}

export abstract class ZLeadscrewKinematics extends KinematicsBase {
    readonly tiltCorrection: TiltCorrection = new TiltCorrection();
}
