declare module 'cors' {
  import { Request, Response, NextFunction } from 'express';
  export function cors(options?: {
    origin?: string | boolean;
    credentials?: boolean;
  }): (req: Request, res: Response, next: NextFunction) => void;
  export default function cors(options?: {
    origin?: string | boolean;
    credentials?: boolean;
  }): (req: Request, res: Response, next: NextFunction) => void;
}
