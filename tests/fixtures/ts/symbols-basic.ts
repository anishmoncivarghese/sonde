export interface Identified {
  id: string;
}

export class AuthService implements Identified {
  id = "auth";

  refresh(): void {}
}

export const createAuth = () => new AuthService();
