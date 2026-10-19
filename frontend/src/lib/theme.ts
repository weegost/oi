export const THEME_KEY = "theme";
export const THEME_EVENT = "themechange";

/** 放在 <head>：在 React 載入前套用上次選的模式，避免深色模式開頁時先閃白 */
export const themeInitScript = `try{if(localStorage.getItem("${THEME_KEY}")==="dark")document.documentElement.classList.add("dark")}catch(e){}`;
