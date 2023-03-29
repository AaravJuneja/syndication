const router = require("express").Router();

function isAuth(req, res, next) {
  if (req.user) {
    let userId = req.user.id;
    if (userId == "0" || userId == "0")
      return next();
  } else {
    res.redirect("/");
  }
}
router.get("/", isAuth, (req, res) => {
  res.render("create");
});

module.exports = router;
