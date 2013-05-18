var Alloy = require('alloy');

exports.definition = {
    
    config: {
        "columns": {
            "category":"string",
            "name":"string",
            "module":"string",
            "action":"string",
            "dimension":"string",
            "metrics":"string",
            "metricsDocumentation":"string",
            "uniqueId":"string"
        },
        "adapter": {
            "type": "piwikapi",
            "collection_name": "piwikreports"
        },
        "settings": {
            "method": "API.getBulkRequest",
            "cache": true
        },
        "defaultParams": {
            "urls": [{method: "API.getReportMetadata", hideMetricsDoc: 1, showSubtableReports: 0, format: "JSON"},
                     {method: "Dashboard.getDashboards", format: "JSON"}]
        }
    },        

    extendModel: function(Model) {        
        _.extend(Model.prototype, {

            getMetricName: function () {
                var metrics = this.getMetrics();
                var sortOrder = this.getSortOrder();

                if (metrics && metrics[sortOrder]) {
                    return metrics[sortOrder];
                }

                return '';
            },
            getReportName: function () {
                return this.get('name');
            },
            getMetrics: function () {
                return this.get('metrics');
            },

            getSortOrder: function (metric) {

                if (metric) {
                    return metric;
                }

                var _ = require("alloy/underscore");
                var preferredRows = Alloy.CFG.piwik.preferredMetrics;
                var sortOrder     = _.first(preferredRows);
                
                var metrics = this.get('metrics');
                if (metrics) {

                    sortOrder = _.find(preferredRows, function (preferredRow) {
                        return !!(metrics[preferredRow]);
                    });

                    if (!sortOrder) {
                        for (var metricName in metrics) {
                            sortOrder = metricName;
                        }
                    }
                }
                
                return sortOrder;
            }
            // extended functions go here

        }); // end extend
        
        return Model;
    },
    
    
    extendCollection: function(Collection) {

        var findReportByWidgetInPreformattedReports = function (widget) {
            if (!widget) {
                return;
            }

            var module = widget.module;
            var action = widget.action;

            if (this.preformattedReports && 
                this.preformattedReports[module] && 
                this.preformattedReports[module][action]) {

                var report = this.preformattedReports[module][action];

                return _.clone(report);
            }
        };

        var resolveDashboardToReports = function (dashboard) {
            if (!dashboard) {
                return [];
            }
            
            var dashboardName = dashboard.name;
            var widgets       = dashboard.widgets;

            var reports = _.map(widgets, findReportByWidgetInPreformattedReports, this);
            reports     = _.compact(reports); 

            _.each(reports, function (report) {
                report.category    = dashboardName;
                report.isDashboard = true;
            });

            return reports;
        };

        var preformatReportsForFasterSearch = function (reports) {
            var formatted = {};

            for (var index = 0; index < reports.length; index++) {
                var report = reports[index];
                var module = report.module;
                var action = report.action;

                if (!formatted[module]) {
                    formatted[module] = {};
                }

                formatted[module][action] = report;
            }

            return formatted;
        };

        _.extend(Collection.prototype, {

            preformattedReports: null,

            fetchAllReports: function (accountModel, siteModel) {
                this.config.defaultParams.urls[0].idSites = siteModel.get('idsite');
                this.config.defaultParams.urls[1].idSite  = siteModel.get('idsite');
                this.config.defaultParams.idSite = siteModel.get('idsite');

                this.fetch({
                    reset: true,
                    account: accountModel
                });
            },

            hasDashboardReport: function () {
                return this.at(0).get('isDashboard');
            },

            getFirstReportThatIsNotMultiSites: function () {
                var index = 0;
                while (this.at(index)) {
                    var module = this.at(index).get('module');

                    if ('MultiSites' != module) {
                        return this.at(index);
                    }

                    index++;
                }
            },

            getEntryReport: function () {

                if (this.hasDashboardReport()) {
                    return this.at(0);
                }

                var preferredReport = this.getFirstReportThatIsNotMultiSites();

                if (preferredReport) {
                    return preferredReport;
                }

                return this.at(0);
            },

            containsAction: function (searchReport) {
                var searchAction = searchReport.get('action');
                var searchModule = searchReport.get('module');

                var reports = this.where({action: searchAction, module: searchModule});
                return !!reports.length;
            },

            extractReportsFromResponse: function (response) {
                var reports = [];
                if (_.isString(response[0])) {
                    reports = JSON.parse(response[0]);
                } 

                if (!_.isArray(reports)) {
                    return [];
                }

                return reports;
            },

            extractDashboardsFromResponse: function (response) {
                var dashboards = [];
                if (_.isString(response[1])) {
                    dashboards = JSON.parse(response[1]);
                } 

                if (!_.isArray(dashboards)) {
                    return [];
                }

                return dashboards;
            },

            parse: function (response) {
                if (!response) {
                    return [];
                }

                var reports    = this.extractReportsFromResponse(response);
                var dashboards = this.extractDashboardsFromResponse(response);

                // TODO optimize algorithm from mapping of dashboards to reports
                this.preformattedReports = preformatReportsForFasterSearch(reports);

                var reportsToAdd = _.map(dashboards, resolveDashboardToReports, this);
                reportsToAdd     = _.flatten(reportsToAdd);

                while (reportsToAdd.length) {
                    reports.unshift(reportsToAdd.pop());
                }

                this.preformattedReports = null;

                return reports;
            }

            // extended functions go here            
            
        }); // end extend
        
        return Collection;
    }
        
};
