"""
AWS FinOps Optimization MCP Lambda - Compute Optimizer, RI/SP Recommendations, Cost Optimization Hub, Trusted Advisor
AWS FinOps 최적화 MCP 람다 - Compute Optimizer, RI/SP 추천, Cost Optimization Hub, Trusted Advisor
"""
import json
from cross_account import get_client, get_role_arn


def lambda_handler(event, context):
    params = event if isinstance(event, dict) else json.loads(event)
    t = params.get("tool_name", "")
    args = params.get("arguments", params)
    target_account_id = args.pop('target_account_id', None)
    role_arn = get_role_arn(target_account_id) if target_account_id else None

    if not t:
        if "rightsizing" in str(params).lower(): t = "get_rightsizing_recommendations"
        elif "savings_plan" in str(params).lower() or "savings plan" in str(params).lower(): t = "get_savings_plans_recommendations"
        elif "reserved" in str(params).lower() or "ri_" in str(params).lower(): t = "get_reserved_instance_recommendations"
        elif "optimization_hub" in str(params).lower() or "hub" in str(params).lower(): t = "get_cost_optimization_hub_recommendations"
        elif "trusted" in str(params).lower() or "advisor" in str(params).lower(): t = "get_trusted_advisor_cost_checks"
        else: t = "get_rightsizing_recommendations"
        args = params

    try:
        # Compute Optimizer: EC2/RDS/ECS/Lambda rightsizing recommendations
        # Compute Optimizer: EC2/RDS/ECS/Lambda 인스턴스 rightsizing 추천
        if t == "get_rightsizing_recommendations":
            resource_type = args.get("resource_type", "all")
            co = get_client('compute-optimizer', 'ap-northeast-2', role_arn)
            results = {}

            if resource_type in ("all", "ec2"):
                try:
                    resp = co.get_ec2_instance_recommendations(maxResults=50)
                    recs = []
                    for r in resp.get("instanceRecommendations", []):
                        options = r.get("recommendationOptions", [])
                        top = options[0] if options else {}
                        recs.append({
                            "instanceArn": r.get("instanceArn", ""),
                            "instanceName": r.get("instanceName", ""),
                            "currentType": r.get("currentInstanceType", ""),
                            "finding": r.get("finding", ""),
                            "recommendedType": top.get("instanceType", ""),
                            "estimatedMonthlySavings": top.get("estimatedMonthlySavings", {}).get("value", 0),
                            "currency": top.get("estimatedMonthlySavings", {}).get("currency", "USD"),
                            "performanceRisk": top.get("performanceRisk", 0),
                            "migrationEffort": top.get("migrationEffort", ""),
                        })
                    results["ec2"] = {"count": len(recs), "recommendations": recs}
                except Exception as e:
                    results["ec2"] = {"error": str(e)[:200]}

            if resource_type in ("all", "rds"):
                try:
                    resp = co.get_rds_database_recommendations(maxResults=50)
                    recs = []
                    for r in resp.get("rdsDatabaseRecommendations", []):
                        options = r.get("recommendationOptions", [])
                        top = options[0] if options else {}
                        recs.append({
                            "resourceArn": r.get("resourceArn", ""),
                            "currentDBInstanceClass": r.get("currentDBInstanceClass", ""),
                            "engine": r.get("engine", ""),
                            "finding": r.get("finding", ""),
                            "recommendedDBInstanceClass": top.get("dbInstanceClass", ""),
                            "estimatedMonthlySavings": top.get("estimatedMonthlySavings", {}).get("value", 0),
                        })
                    results["rds"] = {"count": len(recs), "recommendations": recs}
                except Exception as e:
                    results["rds"] = {"error": str(e)[:200]}

            if resource_type in ("all", "ecs"):
                try:
                    resp = co.get_ecs_service_recommendations(maxResults=50)
                    recs = []
                    for r in resp.get("ecsServiceRecommendations", []):
                        options = r.get("serviceRecommendationOptions", [])
                        top = options[0] if options else {}
                        recs.append({
                            "serviceArn": r.get("serviceArn", ""),
                            "finding": r.get("finding", ""),
                            "launchType": r.get("launchType", ""),
                            "currentCpu": r.get("currentServiceConfiguration", {}).get("cpu", 0),
                            "currentMemory": r.get("currentServiceConfiguration", {}).get("memory", 0),
                            "recommendedCpu": top.get("cpu", 0),
                            "recommendedMemory": top.get("memory", 0),
                            "estimatedMonthlySavings": top.get("estimatedMonthlySavings", {}).get("value", 0),
                        })
                    results["ecs"] = {"count": len(recs), "recommendations": recs}
                except Exception as e:
                    results["ecs"] = {"error": str(e)[:200]}

            if resource_type in ("all", "lambda"):
                try:
                    resp = co.get_lambda_function_recommendations(maxResults=50)
                    recs = []
                    for r in resp.get("lambdaFunctionRecommendations", []):
                        options = r.get("memorySizeRecommendationOptions", [])
                        top = options[0] if options else {}
                        recs.append({
                            "functionArn": r.get("functionArn", ""),
                            "finding": r.get("finding", ""),
                            "currentMemory": r.get("currentMemorySize", 0),
                            "recommendedMemory": top.get("memorySize", 0),
                            "estimatedMonthlySavings": top.get("estimatedMonthlySavings", {}).get("value", 0),
                        })
                    results["lambda"] = {"count": len(recs), "recommendations": recs}
                except Exception as e:
                    results["lambda"] = {"error": str(e)[:200]}

            total_savings = sum(
                sum(r.get("estimatedMonthlySavings", 0) for r in v.get("recommendations", []))
                for v in results.values() if isinstance(v, dict) and "recommendations" in v
            )
            return ok({"resourceType": resource_type, "totalEstimatedMonthlySavings": round(total_savings, 2), "results": results})

        # Cost Explorer: Savings Plans purchase recommendations
        # Cost Explorer: Savings Plans 구매 추천
        elif t == "get_savings_plans_recommendations":
            ce = get_client('ce', 'us-east-1', role_arn)
            sp_type = args.get("savings_plan_type", "COMPUTE_SP")
            term = args.get("term", "ONE_YEAR")
            payment = args.get("payment_option", "NO_UPFRONT")
            lookback = args.get("lookback_period", "SIXTY_DAYS")

            resp = ce.get_savings_plans_purchase_recommendation(
                SavingsPlansType=sp_type,
                TermInYears=term,
                PaymentOption=payment,
                LookbackPeriodInDays=lookback,
            )
            meta = resp.get("SavingsPlansPurchaseRecommendation", {})
            details = meta.get("SavingsPlansPurchaseRecommendationDetails", [])
            summary = meta.get("SavingsPlansPurchaseRecommendationSummary", {})

            recs = []
            for d in details[:20]:
                recs.append({
                    "accountId": d.get("AccountId", ""),
                    "hourlyCommitment": d.get("HourlyCommitmentToPurchase", ""),
                    "estimatedMonthlySavings": d.get("EstimatedMonthlySavingsAmount", ""),
                    "estimatedSavingsPercentage": d.get("EstimatedSavingsPercentage", ""),
                    "estimatedROI": d.get("EstimatedROI", ""),
                    "currentOnDemandSpend": d.get("CurrentAverageHourlyOnDemandSpend", ""),
                    "region": d.get("Region", ""),
                    "instanceFamily": d.get("InstanceFamily", ""),
                })
            return ok({
                "type": sp_type, "term": term, "payment": payment, "lookback": lookback,
                "summary": {
                    "estimatedMonthlySavings": summary.get("EstimatedMonthlySavingsAmount", "0"),
                    "estimatedTotalCost": summary.get("EstimatedTotalCost", "0"),
                    "currentOnDemandSpend": summary.get("CurrentOnDemandSpend", "0"),
                    "estimatedSavingsPercentage": summary.get("EstimatedSavingsPercentage", "0"),
                },
                "recommendations": recs,
            })

        # Cost Explorer: Reserved Instance purchase recommendations
        # Cost Explorer: 예약 인스턴스 구매 추천
        elif t == "get_reserved_instance_recommendations":
            ce = get_client('ce', 'us-east-1', role_arn)
            service = args.get("service", "Amazon Elastic Compute Cloud - Compute")
            term = args.get("term", "ONE_YEAR")
            payment = args.get("payment_option", "NO_UPFRONT")
            lookback = args.get("lookback_period", "SIXTY_DAYS")

            resp = ce.get_reservation_purchase_recommendation(
                Service=service,
                TermInYears=term,
                PaymentOption=payment,
                LookbackPeriodInDays=lookback,
            )
            recs_raw = resp.get("Recommendations", [])
            results = []
            for rec in recs_raw:
                summary = rec.get("RecommendationSummary", {})
                details = rec.get("RecommendationDetails", [])
                for d in details[:20]:
                    inst = d.get("InstanceDetails", {})
                    # Extract instance details from whichever service type
                    inst_info = inst.get("EC2InstanceDetails", inst.get("RDSInstanceDetails",
                        inst.get("ElastiCacheInstanceDetails", inst.get("RedshiftInstanceDetails", {}))))
                    results.append({
                        "instanceType": inst_info.get("InstanceType", inst_info.get("NodeType", "")),
                        "family": inst_info.get("Family", ""),
                        "region": inst_info.get("Region", ""),
                        "platform": inst_info.get("Platform", inst_info.get("DatabaseEngine", "")),
                        "recommendedCount": d.get("RecommendedNumberOfInstancesToPurchase", ""),
                        "estimatedMonthlySavings": d.get("EstimatedMonthlySavingsAmount", ""),
                        "estimatedBreakEvenMonths": d.get("EstimatedBreakEvenInMonths", ""),
                        "upfrontCost": d.get("UpfrontCost", ""),
                        "recurringMonthly": d.get("RecurringStandardMonthlyCost", ""),
                    })
            total_savings = sum(float(r.get("estimatedMonthlySavings", 0) or 0) for r in results)
            return ok({
                "service": service, "term": term, "payment": payment,
                "totalEstimatedMonthlySavings": round(total_savings, 2),
                "recommendations": results,
            })

        # Cost Optimization Hub: unified recommendations across services
        # Cost Optimization Hub: 서비스 전반 통합 최적화 추천
        elif t == "get_cost_optimization_hub_recommendations":
            coh = get_client('cost-optimization-hub', 'us-east-1', role_arn)
            action_type = args.get("action_type")  # Rightsize, Stop, Upgrade, PurchaseSavingsPlans, etc.
            resource_type = args.get("resource_type")  # Ec2Instance, RdsDbInstance, LambdaFunction, etc.
            max_results = min(int(args.get("max_results", 50)), 100)

            kwargs = {"maxResults": max_results}
            if action_type or resource_type:
                f = {}
                if action_type:
                    f["actionTypes"] = [action_type] if isinstance(action_type, str) else action_type
                if resource_type:
                    f["resourceTypes"] = [resource_type] if isinstance(resource_type, str) else resource_type
                kwargs["filter"] = f

            resp = coh.list_recommendations(**kwargs)
            recs = []
            for r in resp.get("items", []):
                recs.append({
                    "recommendationId": r.get("recommendationId", ""),
                    "accountId": r.get("accountId", ""),
                    "region": r.get("region", ""),
                    "resourceId": r.get("resourceId", ""),
                    "resourceArn": r.get("resourceArn", ""),
                    "actionType": r.get("actionType", ""),
                    "resourceType": r.get("resourceType", ""),
                    "estimatedMonthlySavings": r.get("estimatedMonthlySavings", 0),
                    "estimatedSavingsPercentage": r.get("estimatedSavingsPercentage", 0),
                    "currentResourceSummary": r.get("currentResourceSummary", ""),
                    "recommendedResourceSummary": r.get("recommendedResourceSummary", ""),
                    "implementationEffort": r.get("implementationEffort", ""),
                    "source": r.get("source", ""),
                })
            total_savings = sum(float(r.get("estimatedMonthlySavings", 0) or 0) for r in recs)
            return ok({
                "totalRecommendations": len(recs),
                "totalEstimatedMonthlySavings": round(total_savings, 2),
                "recommendations": recs,
            })

        # Trusted Advisor: cost optimization checks
        # Trusted Advisor: 비용 최적화 체크
        elif t == "get_trusted_advisor_cost_checks":
            ta = get_client('support', 'us-east-1', role_arn)
            category = args.get("category", "cost_optimizing")

            checks = ta.describe_trusted_advisor_checks(language='en')
            cost_checks = [c for c in checks.get("checks", []) if c.get("category") == category]

            results = []
            for check in cost_checks[:15]:
                try:
                    result = ta.describe_trusted_advisor_check_result(checkId=check["id"], language='en')
                    r = result.get("result", {})
                    flagged = r.get("flaggedResources", [])
                    results.append({
                        "name": check.get("name", ""),
                        "description": check.get("description", "")[:200],
                        "status": r.get("status", ""),
                        "resourcesSummary": r.get("resourcesSummary", {}),
                        "estimatedMonthlySavings": r.get("categorySpecificSummary", {}).get("costOptimizing", {}).get("estimatedMonthlySavings", 0),
                        "flaggedCount": len(flagged),
                        "flaggedResources": [
                            {h: v for h, v in zip(check.get("metadata", []), f.get("metadata", []))}
                            for f in flagged[:10]
                        ],
                    })
                except Exception:
                    results.append({"name": check.get("name", ""), "error": "Could not fetch"})

            total_savings = sum(float(r.get("estimatedMonthlySavings", 0) or 0) for r in results)
            return ok({
                "category": category,
                "totalChecks": len(results),
                "totalEstimatedMonthlySavings": round(total_savings, 2),
                "checks": results,
            })

        else:
            return err(f"Unknown tool: {t}")

    except Exception as e:
        return err(str(e))


def ok(body):
    return {"statusCode": 200, "body": json.dumps(body, default=str)}


def err(msg):
    return {"statusCode": 500, "body": json.dumps({"error": msg})}
