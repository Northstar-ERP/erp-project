from django.contrib import admin
from .models import Project, Task


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ['name', 'manager', 'status', 'start_date', 'end_date', 'is_deleted']
    list_filter = ['status', 'is_deleted']
    search_fields = ['name']

    def get_queryset(self, request):
        # show soft-deleted rows too, so they can be inspected and filtered
        return self.model.all_objects.all()


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ['title', 'project', 'assigned_to', 'status', 'deadline', 'is_deleted']
    list_filter = ['status', 'is_deleted']
    search_fields = ['title']

    def get_queryset(self, request):
        return self.model.all_objects.all()