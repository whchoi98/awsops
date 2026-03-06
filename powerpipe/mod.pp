mod "local" {
  title = "powerpipe"
  require {
    mod "github.com/turbot/steampipe-mod-aws-compliance" {
      version = "*"
    }
    mod "github.com/turbot/steampipe-mod-aws-insights" {
      version = "*"
    }
  }
}