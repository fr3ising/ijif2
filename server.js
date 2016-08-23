var data_dir = process.env.OPENSHIFT_DATA_DIR || "./";
var express = require('express');
var handlebars = require('express3-handlebars').create({defaultLayout: 'main'});
var fortune = require('./lib/fortune.js');
var aux = require('./lib/aux.js');
var bodyParser = require('body-parser');
var credentials = require(data_dir+'/credentials.js');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var fileStore = require('session-file-store')(session);
var database = require('./lib/database.js');
var infojobs = require('./lib/infojobs.js');
var formidable = require('formidable');
var format = require('format-number');

var server_port = process.env.OPENSHIFT_NODEJS_PORT || 3000;
var server_ip_address = process.env.OPENSHIFT_NODEJS_IP || '127.0.0.1';

var app = express();
var maxResults = 30;

app.engine('handlebars',handlebars.engine);
app.set('view engine','handlebars');
app.set('port', server_port);
app.set('env','development');
app.disable('x-powered-by');

app.use(bodyParser.json());                        
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser(credentials.cookieSecret));
app.use(session({
    secret: credentials.cookieSecret,
    cookie: {maxAge:7*24*3600*1000},
    proxy: true,
    resave: true,
    store: new fileStore,
    saveUninitialized: true
}));

app.use(function(req,res,next) {
    res.locals.showTests = (app.get('env') !== 'production') && (req.query.test === '1');
    next();
});

app.get('/',function(req,res) {
    req.session.fail = false;
    database.lastOffers(10,function(err,rows) {
	database.lastComments(10,function(err,crows) {
	    database.lastSearches(10,function(err,searches) {
		res.render('home',{
		    title:"ijif",
		    nick: req.session.nick,
		    offers: rows,
		    comments: crows,
		    searches: searches
		});
	    });
	});
    });
});

var registerRoutes = require('./lib/registerRoutes.js');
registerRoutes(app);

var chatRoutes = require('./lib/chatRoutes.js');
chatRoutes(app);

var sendPasswordRoutes = require('./lib/sendPasswordRoutes.js');
sendPasswordRoutes(app);

var offerRoutes = require('./lib/offer.js');
offerRoutes(app);

var postCommentRoutes = require('./lib/postCommentRoutes.js');
postCommentRoutes(app);

var sessionRoutes = require('./lib/sessionRoutes.js');
sessionRoutes(app);

app.get('/search',function(req,res) {
    infojobs.getOffers(req.query.q,maxResults,function(err,offers) {
	res.render('searchResults',{
	    offers: offers, q: req.query.q, layout: false});
    });
    if ( req.session.nick ) {
	database.insertSearch(req.query.q,req.session.nick);
    }
});

app.get('/pay',function(req,res) {
    infojobs.getOffers(req.query.q,10*maxResults,function(err,offers) {
	var payOffers = 0;
	var payAcum = 0;
	for(var i=0;i<offers.length;i++) {
	    var n = 0;
	    var acum = 0;
	    if ( offers[i]['salaryMin']['value'].length > 0 ) {
		acum += aux.payToInt(offers[i]['salaryMin']['value']);
		n++;
	    }
	    if ( offers[i]['salaryMax']['value'].length > 0 ) {
		acum += aux.payToInt(offers[i]['salaryMax']['value']);
		n++;
	    }
	    if ( n > 0 ) {
		var mean = acum*aux.periodToInt(offers[i]['salaryPeriod']['value'])/n;
		payOffers++;
		payAcum += mean;
	    }
	}
	var payString = '';
	if ( payOffers > 0 ) {
	    if ( req.query.q.length > 0 ) {
		payString = "El salario medio para las ofertas \""+req.query.q+
		    "\" es de "+aux.intToCash(payAcum/payOffers)+" ("+payOffers+" ofertas analizadas)";
	    } else {
		payString = "El salario medio es de "+aux.intToCash(payAcum/payOffers)+" ("+payOffers+" ofertas analizadas)";
	    }
	} else {
	    payString = 'No se han encontrado ofertas';
	}
	res.render('payResults',{ mean: payString, layout: false });
    });
});

app.get('/about',function(req,res) {
    res.render('about',{
	title: "About ijif",
	fortune: fortune.getFortune(),
	pageTestScript: "/qa/about-tests.js",
	nick: req.session.nick
    });
});

app.use(express.static(__dirname+'/public'));

app.use(function(req,res,next) {
    res.status(404);
    res.render('404');
});

app.use(function(req,res,next) {
    console.error(err.stack);
    res.status(500);
    res.render('500');
});

app.listen(app.get('port'),server_ip_address,function() {
    console.log('Express started on http://localhost:'+app.get('port')+'; Press Ctrl-C to terminate.');
});
