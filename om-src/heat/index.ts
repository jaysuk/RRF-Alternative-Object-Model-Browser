import ModelCollection from "../ModelCollection";
import ModelObject from "../ModelObject";
import Heater from "./Heater";

export class Heat extends ModelObject {
    /**
     * @deprecated use bedHeaterMapping instead
     */
    bedHeaters: Array<number> = new Array<number>();
    bedHeaterMapping: Array<Array<number>> = [];
    /**
     * @deprecated use chamberHeaterMapping instead
     */
    chamberHeaters: Array<number> = new Array<number>();
    chamberHeaterMapping: Array<Array<number>> = [];
    coldExtrudeTemperature: number = 160;
    coldRetractTemperature: number = 90;
    readonly heaters: ModelCollection<Heater | null> = new ModelCollection(Heater);
}

export default Heat

export * from "./Heater";
export * from "./HeaterModel";
export * from "./HeaterMonitor";
