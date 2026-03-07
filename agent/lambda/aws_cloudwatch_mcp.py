"""AWS CloudWatch MCP Lambda - Metrics, Alarms, Logs, Log Insights"""
import json
import boto3
import time
from datetime import datetime, timedelta


def lambda_handler(event, context):
    params = event if isinstance(event, dict) else json.loads(event)
    t = params.get("tool_name", "")
    args = params.get("arguments", params)
    region = args.get("region", "ap-northeast-2")

    if not t:
        if "query" in params and "log_group" in params: t = "execute_log_insights_query"
        elif "query_id" in params: t = "get_logs_insight_query_results"
        elif "alarm_name" in params: t = "get_alarm_history"
        elif "metric_name" in params and "analyze" in str(params).lower(): t = "analyze_metric"
        elif "metric_name" in params: t = "get_metric_data"
        elif "log_group" in params: t = "analyze_log_group"
        elif "alarm" in str(params).lower(): t = "get_active_alarms"
        else: t = "describe_log_groups"
        args = params

    try:
        cw = boto3.client('cloudwatch', region_name=region)
        logs = boto3.client('logs', region_name=region)

        # ========== Metrics ==========
        if t == "get_metric_data":
            namespace = args.get("namespace", "AWS/EC2")
            metric_name = args.get("metric_name", "CPUUtilization")
            dimensions = args.get("dimensions", {})
            stat = args.get("statistic", "Average")
            minutes = args.get("minutes", 60)
            period = args.get("period", 300)

            dim_list = [{"Name": k, "Value": v} for k, v in dimensions.items()] if isinstance(dimensions, dict) else dimensions
            end = datetime.utcnow()
            start = end - timedelta(minutes=minutes)

            resp = cw.get_metric_statistics(
                Namespace=namespace, MetricName=metric_name,
                Dimensions=dim_list, StartTime=start, EndTime=end,
                Period=period, Statistics=[stat])
            datapoints = sorted(resp.get("Datapoints", []), key=lambda x: x.get("Timestamp", ""))
            return ok({"namespace": namespace, "metricName": metric_name,
                "statistic": stat, "period": period,
                "datapoints": [{"timestamp": str(d["Timestamp"]), "value": round(d.get(stat, 0), 4)}
                    for d in datapoints[-30:]]})

        elif t == "get_metric_metadata":
            namespace = args.get("namespace", "AWS/EC2")
            metric_name = args.get("metric_name", "")
            resp = cw.list_metrics(Namespace=namespace,
                MetricName=metric_name if metric_name else None)
            metrics = resp.get("Metrics", [])[:20]
            return ok({"namespace": namespace, "metrics": [
                {"name": m["MetricName"], "dimensions": {d["Name"]: d["Value"] for d in m.get("Dimensions", [])}}
                for m in metrics]})

        elif t == "analyze_metric":
            namespace = args.get("namespace", "AWS/EC2")
            metric_name = args.get("metric_name", "CPUUtilization")
            dimensions = args.get("dimensions", {})
            dim_list = [{"Name": k, "Value": v} for k, v in dimensions.items()] if isinstance(dimensions, dict) else dimensions
            end = datetime.utcnow()
            start = end - timedelta(hours=24)

            resp = cw.get_metric_statistics(
                Namespace=namespace, MetricName=metric_name,
                Dimensions=dim_list, StartTime=start, EndTime=end,
                Period=3600, Statistics=["Average", "Maximum", "Minimum"])
            dps = sorted(resp.get("Datapoints", []), key=lambda x: x.get("Timestamp", ""))

            if dps:
                avgs = [d.get("Average", 0) for d in dps]
                maxs = [d.get("Maximum", 0) for d in dps]
                avg_val = sum(avgs) / len(avgs)
                max_val = max(maxs)
                min_val = min(d.get("Minimum", 0) for d in dps)
                trend = "increasing" if len(avgs) > 1 and avgs[-1] > avgs[0] * 1.1 else "decreasing" if len(avgs) > 1 and avgs[-1] < avgs[0] * 0.9 else "stable"
                return ok({"metric": metric_name, "namespace": namespace, "period": "24h",
                    "average": round(avg_val, 2), "max": round(max_val, 2), "min": round(min_val, 2),
                    "trend": trend, "datapoints": len(dps)})
            return ok({"metric": metric_name, "message": "No datapoints found"})

        elif t == "get_recommended_metric_alarms":
            namespace = args.get("namespace", "AWS/EC2")
            metric_name = args.get("metric_name", "CPUUtilization")
            recommendations = {
                "CPUUtilization": {"threshold": 80, "comparison": "GreaterThanThreshold", "period": 300, "evaluationPeriods": 3},
                "MemoryUtilization": {"threshold": 85, "comparison": "GreaterThanThreshold", "period": 300, "evaluationPeriods": 3},
                "StatusCheckFailed": {"threshold": 0, "comparison": "GreaterThanThreshold", "period": 60, "evaluationPeriods": 2},
                "NetworkIn": {"threshold": 1000000000, "comparison": "GreaterThanThreshold", "period": 300, "evaluationPeriods": 3},
                "DiskReadOps": {"threshold": 10000, "comparison": "GreaterThanThreshold", "period": 300, "evaluationPeriods": 3},
            }
            rec = recommendations.get(metric_name, {"threshold": "auto", "comparison": "GreaterThanThreshold", "period": 300, "evaluationPeriods": 3})
            return ok({"metric": metric_name, "namespace": namespace, "recommendation": rec,
                "note": "Adjust threshold based on your baseline workload"})

        # ========== Alarms ==========
        elif t == "get_active_alarms":
            resp = cw.describe_alarms(StateValue="ALARM")
            alarms = [{"name": a["AlarmName"], "metric": a.get("MetricName", ""),
                "namespace": a.get("Namespace", ""), "state": a["StateValue"],
                "reason": a.get("StateReason", "")[:150],
                "threshold": a.get("Threshold"), "comparison": a.get("ComparisonOperator", ""),
                "updatedAt": str(a.get("StateUpdatedTimestamp", ""))}
                for a in resp.get("MetricAlarms", [])[:20]]
            return ok({"activeAlarms": alarms, "count": len(alarms)})

        elif t == "get_alarm_history":
            alarm_name = args.get("alarm_name", "")
            days = args.get("days", 7)
            end = datetime.utcnow()
            start = end - timedelta(days=days)
            resp = cw.describe_alarm_history(
                AlarmName=alarm_name, StartDate=start, EndDate=end,
                HistoryItemType="StateUpdate", MaxRecords=20)
            history = [{"timestamp": str(h.get("Timestamp", "")),
                "summary": h.get("HistorySummary", ""), "type": h.get("HistoryItemType", "")}
                for h in resp.get("AlarmHistoryItems", [])]
            return ok({"alarmName": alarm_name, "history": history})

        # ========== Logs ==========
        elif t == "describe_log_groups":
            prefix = args.get("prefix", "")
            kwargs = {"limit": 20}
            if prefix: kwargs["logGroupNamePrefix"] = prefix
            resp = logs.describe_log_groups(**kwargs)
            groups = [{"name": g["logGroupName"], "storedBytes": g.get("storedBytes", 0),
                "retentionDays": g.get("retentionInDays", "Never expires"),
                "createdAt": str(datetime.fromtimestamp(g.get("creationTime", 0) / 1000))}
                for g in resp.get("logGroups", [])]
            return ok({"logGroups": groups, "count": len(groups)})

        elif t == "analyze_log_group":
            log_group = args.get("log_group", "")
            minutes = args.get("minutes", 30)
            start_time = int((time.time() - minutes * 60) * 1000)
            filter_pattern = args.get("filter_pattern", "ERROR")

            resp = logs.filter_log_events(
                logGroupName=log_group, startTime=start_time,
                filterPattern=filter_pattern, limit=50)
            events = [{"timestamp": str(datetime.fromtimestamp(e.get("timestamp", 0) / 1000)),
                "message": e.get("message", "")[:300]}
                for e in resp.get("events", [])]
            return ok({"logGroup": log_group, "filterPattern": filter_pattern,
                "timeRange": "{} minutes".format(minutes),
                "matchingEvents": len(events), "events": events})

        elif t == "execute_log_insights_query":
            log_group = args.get("log_group", "")
            query = args.get("query", "fields @timestamp, @message | sort @timestamp desc | limit 20")
            minutes = args.get("minutes", 60)
            end_time = int(time.time())
            start_time = end_time - minutes * 60

            log_groups = [log_group] if isinstance(log_group, str) else log_group
            resp = logs.start_query(
                logGroupNames=log_groups, startTime=start_time,
                endTime=end_time, queryString=query)
            query_id = resp.get("queryId", "")
            return ok({"queryId": query_id, "status": "STARTED",
                "note": "Use get_logs_insight_query_results with this queryId to get results"})

        elif t == "get_logs_insight_query_results":
            query_id = args.get("query_id", "")
            resp = logs.get_query_results(queryId=query_id)
            status = resp.get("status", "")
            results = []
            for row in resp.get("results", [])[:50]:
                results.append({f["field"]: f["value"] for f in row})
            return ok({"queryId": query_id, "status": status,
                "results": results, "count": len(results),
                "stats": resp.get("statistics", {})})

        elif t == "cancel_logs_insight_query":
            query_id = args.get("query_id", "")
            logs.stop_query(queryId=query_id)
            return ok({"queryId": query_id, "status": "CANCELLED"})

        return err("Unknown tool: " + t)

    except Exception as e:
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}


def ok(body):
    return {"statusCode": 200, "body": json.dumps(body, default=str)}

def err(msg):
    return {"statusCode": 400, "body": json.dumps({"error": msg})}
