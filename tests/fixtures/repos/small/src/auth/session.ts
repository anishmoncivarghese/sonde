import { Base, type Refreshable } from "./base";
import { validate } from "../util/validate";

export class SessionManager extends Base implements Refreshable { refresh() { return validate(this.token); } }
