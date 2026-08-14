import assert from "node:assert/strict";
import header from "../api/header.js";
import profile from "../api/profile.js";
import skills from "../api/skills.js";
import footer from "../api/footer.js";
import banner from "../api/banner.js";

const handlers = { header, profile, skills, footer, banner };
const forbidden = /Hazy019|Kyrell Santillan|OPEN FOR WORK|\bOFW\b/;

for (const [name, handler] of Object.entries(handlers)) {
  for (const theme of ["light", "dark"]) {
    for (const layout of ["", "&layout=mobile"]) {
      const response = await handler(new Request(`https://scan.local/api/${name}?theme=${theme}&preview=1${layout}`));
      assert.doesNotMatch(await response.text(), forbidden, `${name} ${theme}${layout} contains forbidden identity content`);
    }
  }
}

console.log("Runtime identity scan passed");
