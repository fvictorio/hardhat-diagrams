import "hardhat/types/config";
import { ResolvedFile } from "hardhat/types";

declare module "hardhat/types/config" {
  export interface HardhatUserConfig {
    diagrams?: {
      ignore?: (file: ResolvedFile) => boolean;
    };
  }

  export interface HardhatConfig {
    diagrams: {
      ignore?: (file: ResolvedFile) => boolean;
    };
  }
}
