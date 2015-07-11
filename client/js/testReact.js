console.log(_.map([1,2,3], function(num) {debugger;return num+1;}));
var Route = Router.Route;
var RouteHandler = Router.RouteHandler;
// declare our routes and their hierarchy
var routes = (
  <Route handler={App}>
    <Route path="landing" handler={Landing}/>
    <Route path="all-files" handler={AllFiles}/>
  </Route>
);

var App = React.createClass({
  render () {
    return (
      <div>
        <h1>App</h1>
        <RouteHandler/>
      </div>
    )
  }
});

Router.run(routes, Router.HashLocation, function (Root) {
  React.render(<Root/>, document.body);
});
var Landing = React.createClass({
  render: function () {
    return <h2>Landing</h2>;
  }
});

var AllFiles = React.createClass({
  render: function () {
    return <h2>All Files</h2>;
  }
});
