"""AWS CloudTrail MCP Lambda - Event lookup, CloudTrail Lake analytics"""
import json
import boto3
from datetime import datetime, timedelta


def lambda_handler(event, context):
    params = event if isinstance(event, dict) else json.loads(event)
    t = params.get("tool_name", "")
    args = params.get("arguments", params)
    region = args.get("region", "ap-northeast-2")

    if not t:
        if "query" in params and "event_data_store" in params: t = "lake_query"
        elif "query_id" in params and "status" in str(params).lower(): t = "get_query_status"
        elif "query_id" in params: t = "get_query_results"
        elif "event_data_store" in str(params).lower() or "data_store" in str(params).lower(): t = "list_event_data_stores"
        else: t = "lookup_events"
        args = params

    try:
        ct = boto3.client('cloudtrail', region_name=region)

        if t == "lookup_events":
            minutes = args.get("minutes", 60)
            max_results = args.get("max_results", 20)
            end = datetime.utcnow()
            start = end - timedelta(minutes=minutes)

            kwargs = {"StartTime": start, "EndTime": end, "MaxResults": min(max_results, 50)}

            # Build lookup attributes
            lookup_attrs = []
            if args.get("username"):
                lookup_attrs.append({"AttributeKey": "Username", "AttributeValue": args["username"]})
            if args.get("event_name"):
                lookup_attrs.append({"AttributeKey": "EventName", "AttributeValue": args["event_name"]})
            if args.get("resource_type"):
                lookup_attrs.append({"AttributeKey": "ResourceType", "AttributeValue": args["resource_type"]})
            if args.get("resource_name"):
                lookup_attrs.append({"AttributeKey": "ResourceName", "AttributeValue": args["resource_name"]})
            if args.get("event_source"):
                lookup_attrs.append({"AttributeKey": "EventSource", "AttributeValue": args["event_source"]})
            if args.get("read_only"):
                lookup_attrs.append({"AttributeKey": "ReadOnly", "AttributeValue": args["read_only"]})

            if lookup_attrs:
                kwargs["LookupAttributes"] = lookup_attrs[:1]  # API only supports 1 attribute

            resp = ct.lookup_events(**kwargs)
            events = []
            for e in resp.get("Events", []):
                ce = json.loads(e.get("CloudTrailEvent", "{}"))
                events.append({
                    "eventTime": str(e.get("EventTime", "")),
                    "eventName": e.get("EventName", ""),
                    "username": e.get("Username", ""),
                    "eventSource": ce.get("eventSource", ""),
                    "sourceIPAddress": ce.get("sourceIPAddress", ""),
                    "awsRegion": ce.get("awsRegion", ""),
                    "readOnly": ce.get("readOnly"),
                    "errorCode": ce.get("errorCode", ""),
                    "errorMessage": ce.get("errorMessage", "")[:100],
                    "resources": [{"type": r.get("ResourceType", ""), "name": r.get("ResourceName", "")}
                        for r in e.get("Resources", [])[:3]],
                })
            return ok({"events": events, "count": len(events),
                "timeRange": "{} minutes".format(minutes)})

        elif t == "list_event_data_stores":
            resp = ct.list_event_data_stores()
            stores = [{"id": s.get("EventDataStoreArn", "").split("/")[-1],
                "name": s.get("Name", ""), "status": s.get("Status", ""),
                "multiRegion": s.get("MultiRegionEnabled", False),
                "retentionDays": s.get("RetentionPeriod", 0),
                "createdAt": str(s.get("CreatedTimestamp", ""))}
                for s in resp.get("EventDataStores", [])]
            return ok({"eventDataStores": stores, "count": len(stores)})

        elif t == "lake_query":
            eds_id = args.get("event_data_store", "")
            query = args.get("query", "")
            if not eds_id or not query:
                return err("event_data_store and query are required")
            resp = ct.start_query(QueryStatement=query)
            return ok({"queryId": resp.get("QueryId", ""), "status": "STARTED",
                "note": "Use get_query_results with this queryId"})

        elif t == "get_query_status":
            query_id = args.get("query_id", "")
            resp = ct.describe_query(QueryId=query_id)
            return ok({"queryId": query_id, "status": resp.get("QueryStatus", ""),
                "bytesScanned": resp.get("QueryStatistics", {}).get("BytesScanned", 0),
                "eventsScanned": resp.get("QueryStatistics", {}).get("EventsScanned", 0)})

        elif t == "get_query_results":
            query_id = args.get("query_id", "")
            kwargs = {"QueryId": query_id}
            if args.get("next_token"):
                kwargs["NextToken"] = args["next_token"]
            resp = ct.get_query_results(**kwargs)
            rows = []
            columns = resp.get("QueryResultRows", [])
            for row in columns[:50]:
                rows.append({col_name: col_val for item in row for col_name, col_val in item.items()})
            return ok({"queryId": query_id, "status": resp.get("QueryStatus", ""),
                "results": rows, "count": len(rows),
                "nextToken": resp.get("NextToken")})

        return err("Unknown tool: " + t)

    except Exception as e:
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}


def ok(body):
    return {"statusCode": 200, "body": json.dumps(body, default=str)}

def err(msg):
    return {"statusCode": 400, "body": json.dumps({"error": msg})}
