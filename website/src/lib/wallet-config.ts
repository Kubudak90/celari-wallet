"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { sepolia } from "wagmi/chains";
import { type Theme } from "@rainbow-me/rainbowkit";
import { WALLETCONNECT_PROJECT_ID } from "./constants";

export const wagmiConfig = getDefaultConfig({
  appName: "Celari Bridge",
  projectId: WALLETCONNECT_PROJECT_ID || "celari-bridge-demo",
  chains: [sepolia],
  ssr: true,
});

export const celariRainbowTheme: Theme = {
  blurs: {
    modalOverlay: "blur(8px)",
  },
  colors: {
    accentColor: "#8B2D3A",
    accentColorForeground: "#E8D8CC",
    actionButtonBorder: "transparent",
    actionButtonBorderMobile: "transparent",
    actionButtonSecondaryBackground: "#1C1616",
    closeButton: "#8A7A70",
    closeButtonBackground: "#1C1616",
    connectButtonBackground: "#8B2D3A",
    connectButtonBackgroundError: "#FF494A",
    connectButtonInnerBackground: "#5C1D28",
    connectButtonText: "#E8D8CC",
    connectButtonTextError: "#E8D8CC",
    connectionIndicator: "#30E000",
    downloadBottomCardBackground:
      "linear-gradient(126deg, #151111 0%, #1C1616 100%)",
    downloadTopCardBackground:
      "linear-gradient(126deg, #8B2D3A 0%, #C87941 100%)",
    error: "#FF494A",
    generalBorder: "#2A2222",
    generalBorderDim: "#1C1616",
    menuItemBackground: "#1C1616",
    modalBackdrop: "rgba(0, 0, 0, 0.6)",
    modalBackground: "#151111",
    modalBorder: "#2A2222",
    modalText: "#E8D8CC",
    modalTextDim: "#8A7A70",
    modalTextSecondary: "#8A7A70",
    profileAction: "#1C1616",
    profileActionHover: "#2A2222",
    profileForeground: "#151111",
    selectedOptionBorder: "#8B2D3A",
    standby: "#C87941",
  },
  fonts: {
    body: "var(--font-outfit)",
  },
  radii: {
    actionButton: "0px",
    connectButton: "0px",
    menuButton: "0px",
    modal: "0px",
    modalMobile: "0px",
  },
  shadows: {
    connectButton: "0px 0px 0px transparent",
    dialog: "0px 8px 32px rgba(0, 0, 0, 0.32)",
    profileDetailsAction: "0px 0px 0px transparent",
    selectedOption: "0px 0px 0px transparent",
    selectedWallet: "0px 0px 0px transparent",
    walletLogo: "0px 0px 0px transparent",
  },
};
