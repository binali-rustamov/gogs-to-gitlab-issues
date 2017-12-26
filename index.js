let conf = require("./conf.json");
let Migrator = require('./migrator');

let migrator = new Migrator(conf);

migrator.start();